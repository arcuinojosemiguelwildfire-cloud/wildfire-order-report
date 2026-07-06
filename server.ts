import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPrisma } from './src/db/client.ts';
import { seedDatabase } from './src/db/seed.ts';

// Set Timezone to Asia/Manila for dates
process.env.TZ = 'Asia/Manila';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized error mapping helper for all database operations
function handleApiError(err: any, res: express.Response) {
  console.error('[API Error]', err);

  if (err.name === "DATABASE_URL_MISSING" || err.message === "DATABASE_URL_MISSING") {
    return res.status(500).json({
      success: false,
      code: "DATABASE_URL_MISSING",
      message: "Database configuration is unavailable."
    });
  }

  const isDbConnectionError = 
    err.code?.startsWith("P10") || 
    err.code?.startsWith("P20") ||
    err.message?.includes("Can't reach database") ||
    err.message?.includes("connect") ||
    err.message?.includes("Neon") ||
    err.message?.includes("connection") ||
    err.message?.includes("PrismaClient") ||
    err.name?.includes("PrismaClient") ||
    err.name?.includes("Initialization");

  if (isDbConnectionError) {
    return res.status(500).json({
      success: false,
      code: "DATABASE_CONNECTION_FAILED",
      message: "Database connection failed."
    });
  }

  return res.status(500).json({
    success: false,
    message: err.message || "An internal server error occurred."
  });
}

// Simple wrapper to safely route async Express handlers through our centralized error mapping
const asyncHandler = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch((err) => handleApiError(err, res));
  };
};

async function startServer() {
  const app = express();
  app.use(express.json());

  // Run database seeding if needed on start
  try {
    await seedDatabase();
  } catch (seedErr) {
    console.error('Failed seeding database on startup:', seedErr);
  }

  // --- RECALCULATE AND STATUS SYNC ENGINE ---
  const syncOrderAndItemStatuses = async (orderId: string, tx: any) => {
    const prismaTx = tx || getPrisma();

    // Get all items in the order
    const items = await prismaTx.orderItem.findMany({
      where: { orderId },
      include: {
        transactionItems: {
          include: {
            usageTransaction: true,
          },
        },
      },
    });

    let totalReceived = 0;
    let totalAvailable = 0;
    let anyReusableDeployed = false;

    for (const item of items) {
      // Sum only ACTIVE transactions
      const activeTransItems = item.transactionItems.filter(
        (ti: any) => ti.usageTransaction.status === 'ACTIVE'
      );

      const totalQtyInTransactions = activeTransItems.reduce((acc: number, ti: any) => acc + ti.quantity, 0);

      let qtyUsed = 0;
      let qtyDeployed = 0;

      if (item.itemType === 'CONSUMABLE') {
        qtyUsed = totalQtyInTransactions;
      } else {
        qtyDeployed = totalQtyInTransactions;
      }

      const availableQuantity = Math.max(0, item.quantityReceived - (item.itemType === 'CONSUMABLE' ? qtyUsed : qtyDeployed));

      totalReceived += item.quantityReceived;
      totalAvailable += availableQuantity;

      if (item.itemType === 'REUSABLE' && qtyDeployed > 0) {
        anyReusableDeployed = true;
      }

      // Determine Item Status
      let currentStatus = 'IN_STOCK';
      if (item.itemType === 'CONSUMABLE') {
        if (availableQuantity === 0) {
          currentStatus = 'FULLY_USED';
        } else {
          currentStatus = 'IN_STOCK';
        }
      } else {
        // REUSABLE
        if (qtyDeployed === 0) {
          if (availableQuantity > 0) {
            currentStatus = 'IN_STOCK';
          } else {
            currentStatus = 'OUT_OF_STOCK';
          }
        } else {
          // qtyDeployed > 0
          if (availableQuantity > 0) {
            currentStatus = 'PARTIALLY_DEPLOYED';
          } else {
            currentStatus = 'DEPLOYED';
          }
        }
      }

      await prismaTx.orderItem.update({
        where: { id: item.id },
        data: {
          quantityUsed: qtyUsed,
          quantityDeployed: qtyDeployed,
          availableQuantity: availableQuantity,
          currentStatus: currentStatus,
        },
      });
    }

    // Determine Order status
    let orderStatus = 'IN_STOCK';
    if (totalAvailable === totalReceived) {
      orderStatus = 'IN_STOCK';
    } else if (totalAvailable === 0) {
      if (anyReusableDeployed) {
        orderStatus = 'DEPLOYED';
      } else {
        orderStatus = 'FULLY_USED';
      }
    } else {
      orderStatus = 'PARTIALLY_DEPLOYED';
    }

    const currentOrder = await prismaTx.order.findUnique({ where: { id: orderId } });
    if (currentOrder && currentOrder.status !== 'Closed') {
      await prismaTx.order.update({
        where: { id: orderId },
        data: {
          status: orderStatus,
        },
      });
    }
  };

  // --- AUTH MIDDLEWARE BYPASS ---
  const authenticateToken = (req: any, res: any, next: any) => {
    req.user = {
      id: 'guest-id-123',
      fullName: 'Guest Operator',
      email: 'guest@tracker.com',
      role: 'ADMIN',
    };
    next();
  };

  // --- API ENDPOINTS ---

  // GET /api/health
  app.get('/api/health', async (req, res) => {
    try {
      const db = getPrisma();
      await db.$queryRaw`SELECT 1`;
      return res.status(200).json({
        success: true,
        database: "connected"
      });
    } catch (err: any) {
      console.error("Health check database verification failed:", err);
      if (err.name === "DATABASE_URL_MISSING" || err.message === "DATABASE_URL_MISSING") {
        return res.status(500).json({
          success: false,
          code: "DATABASE_URL_MISSING",
          message: "Database configuration is unavailable."
        });
      }
      return res.status(500).json({
        success: false,
        code: "DATABASE_CONNECTION_FAILED",
        message: "Database connection failed."
      });
    }
  });

  // Mock Authentication Endpoints
  app.post('/api/auth/login', (req, res) => {
    res.json({
      token: 'guest-jwt-token',
      user: {
        id: 'guest-id-123',
        email: 'guest@tracker.com',
        fullName: 'Guest Operator',
        role: 'ADMIN',
      },
    });
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    res.json({
      user: req.user,
    });
  });

  // GET /api/dashboard
  app.get('/api/dashboard', authenticateToken, asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    let dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter = {
        usageDate: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        },
      };
    }

    const db = getPrisma();

    // Fetch items & count stats
    const items = await db.orderItem.findMany();
    const totalReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
    const totalAvailable = items.reduce((sum, item) => sum + item.availableQuantity, 0);
    const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
    const outOfStockItems = items.filter(i => i.availableQuantity === 0).length;

    // Calculate total used this month/period
    const activeTxItems = await db.usageTransactionItem.findMany({
      where: {
        usageTransaction: {
          status: 'ACTIVE',
          ...dateFilter,
        },
      },
    });
    const totalUsedThisMonth = activeTxItems.reduce((sum, ti) => sum + ti.quantity, 0);

    const stats = {
      totalReceived,
      totalUsedThisMonth,
      totalAvailable,
      currentlyDeployed,
      pendingReturn: 0,
      lowStockItems: outOfStockItems,
      outOfStockItems,
    };

    // Charts data
    const allTx = await db.usageTransaction.findMany({
      where: { status: 'ACTIVE' },
      include: { items: { include: { orderItem: true } } },
      orderBy: { usageDate: 'asc' },
    });

    // 1. Monthly Usage Trend
    const trendMap: Record<string, number> = {};
    allTx.forEach(tx => {
      const date = new Date(tx.usageDate);
      const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
      const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
      trendMap[monthName] = (trendMap[monthName] || 0) + qtySum;
    });
    const trend = Object.entries(trendMap).map(([month, quantity]) => ({ month, quantity }));

    // 2. Usage by Purpose
    let eventSum = 0;
    let officeSum = 0;
    let employeeSum = 0;
    allTx.forEach(tx => {
      const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
      if (tx.usageType === 'EVENT') eventSum += qtySum;
      else if (tx.usageType === 'OFFICE') officeSum += qtySum;
      else if (tx.usageType === 'EMPLOYEE_REPLACEMENT') employeeSum += qtySum;
    });
    const purpose = [
      { name: 'Event Use', value: eventSum },
      { name: 'Office Use', value: officeSum },
      { name: 'Employee Replacement', value: employeeSum },
    ];

    // 3. Top Used Items
    const itemMap: Record<string, number> = {};
    allTx.forEach(tx => {
      tx.items.forEach(i => {
        if (i.orderItem) {
          itemMap[i.orderItem.itemName] = (itemMap[i.orderItem.itemName] || 0) + i.quantity;
        }
      });
    });
    const topItems = Object.entries(itemMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // 4. Top Events by Deployment
    const eventMap: Record<string, number> = {};
    allTx.forEach(tx => {
      if (tx.usageType === 'EVENT' && tx.eventName) {
        const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        eventMap[tx.eventName] = (eventMap[tx.eventName] || 0) + qtySum;
      }
    });
    const topEvents = Object.entries(eventMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const charts = {
      trend,
      purpose,
      topItems,
      topEvents,
    };

    res.json({ stats, charts });
  }));

  // GET /api/dashboard/stats
  app.get('/api/dashboard/stats', authenticateToken, asyncHandler(async (req, res) => {
    const db = getPrisma();
    const items = await db.orderItem.findMany();
    const totalReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
    const totalAvailable = items.reduce((sum, item) => sum + item.availableQuantity, 0);
    const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
    const outOfStockItems = items.filter(i => i.availableQuantity === 0).length;

    const activeTxItems = await db.usageTransactionItem.findMany({
      where: { usageTransaction: { status: 'ACTIVE' } },
    });
    const totalUsedThisMonth = activeTxItems.reduce((sum, ti) => sum + ti.quantity, 0);

    res.json({
      totalReceived,
      totalUsedThisMonth,
      totalAvailable,
      currentlyDeployed,
      pendingReturn: 0,
      lowStockItems: outOfStockItems,
      outOfStockItems,
    });
  }));

  // GET /api/dashboard/charts
  app.get('/api/dashboard/charts', authenticateToken, asyncHandler(async (req, res) => {
    const db = getPrisma();
    const allTx = await db.usageTransaction.findMany({
      where: { status: 'ACTIVE' },
      include: { items: { include: { orderItem: true } } },
    });

    const trendMap: Record<string, number> = {};
    allTx.forEach(tx => {
      const date = new Date(tx.usageDate);
      const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
      const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
      trendMap[monthName] = (trendMap[monthName] || 0) + qtySum;
    });
    const trend = Object.entries(trendMap).map(([month, quantity]) => ({ month, quantity }));

    let eventSum = 0;
    let officeSum = 0;
    let employeeSum = 0;
    allTx.forEach(tx => {
      const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
      if (tx.usageType === 'EVENT') eventSum += qtySum;
      else if (tx.usageType === 'OFFICE') officeSum += qtySum;
      else if (tx.usageType === 'EMPLOYEE_REPLACEMENT') employeeSum += qtySum;
    });
    const purpose = [
      { name: 'Event Use', value: eventSum },
      { name: 'Office Use', value: officeSum },
      { name: 'Employee Replacement', value: employeeSum },
    ];

    const itemMap: Record<string, number> = {};
    allTx.forEach(tx => {
      tx.items.forEach(i => {
        if (i.orderItem) {
          itemMap[i.orderItem.itemName] = (itemMap[i.orderItem.itemName] || 0) + i.quantity;
        }
      });
    });
    const topItems = Object.entries(itemMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const eventMap: Record<string, number> = {};
    allTx.forEach(tx => {
      if (tx.usageType === 'EVENT' && tx.eventName) {
        const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        eventMap[tx.eventName] = (eventMap[tx.eventName] || 0) + qtySum;
      }
    });
    const topEvents = Object.entries(eventMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    res.json({ trend, purpose, topItems, topEvents });
  }));

  // GET /api/dashboard/low-stock
  app.get('/api/dashboard/low-stock', authenticateToken, asyncHandler(async (req, res) => {
    const db = getPrisma();
    const items = await db.orderItem.findMany({
      where: { availableQuantity: 0 },
      include: { order: true },
    });
    const list = items.map(item => ({
      id: item.id,
      itemName: item.itemName,
      itemType: item.itemType,
      qtyAvailable: item.availableQuantity,
      minimumStock: 0,
      orderNumber: item.order.orderNumber,
    }));
    res.json(list);
  }));

  // GET /api/orders
  app.get('/api/orders', authenticateToken, asyncHandler(async (req, res) => {
    const { search } = req.query;
    let whereClause: any = {};

    if (search) {
      const searchStr = String(search).toLowerCase();
      whereClause.OR = [
        { orderTitle: { contains: searchStr, mode: 'insensitive' } },
        { notes: { contains: searchStr, mode: 'insensitive' } },
        { encodedBy: { contains: searchStr, mode: 'insensitive' } },
      ];
      const searchInt = parseInt(searchStr, 10);
      if (!isNaN(searchInt)) {
        whereClause.OR.push({ orderNumber: searchInt });
      }
    }

    const db = getPrisma();
    const orders = await db.order.findMany({
      where: whereClause,
      include: { items: true },
      orderBy: { orderNumber: 'desc' },
    });

    const formattedOrders = orders.map(order => {
      const qtyReceived = order.items.reduce((sum, item) => sum + item.quantityReceived, 0);
      const qtyAvailable = order.items.reduce((sum, item) => sum + item.availableQuantity, 0);
      return {
        ...order,
        qtyReceived,
        qtyAvailable,
      };
    });

    res.json(formattedOrders);
  }));

  // GET /api/orders/:id
  app.get('/api/orders/:id', authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const db = getPrisma();
    const order = await db.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const qtyReceived = order.items.reduce((sum, item) => sum + item.quantityReceived, 0);
    const qtyAvailable = order.items.reduce((sum, item) => sum + item.availableQuantity, 0);

    res.json({
      ...order,
      qtyReceived,
      qtyAvailable,
    });
  }));

  // POST /api/orders
  app.post('/api/orders', authenticateToken, asyncHandler(async (req: any, res) => {
    const { orderTitle, dateReceived, overallCondition, status, notes, encodedBy, items } = req.body;

    if (!orderTitle || !dateReceived || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order header or item fields.' });
    }

    // Check valid item rows
    for (const i of items) {
      if (!i.itemName || !i.itemType || !i.quantityReceived || i.quantityReceived <= 0) {
        return res.status(400).json({ error: 'All items must have a name, type, and positive quantity received.' });
      }
    }

    const db = getPrisma();
    const result = await db.$transaction(async (tx) => {
      // Find next order number sequentially
      const lastOrder = await tx.order.findFirst({
        orderBy: { orderNumber: 'desc' },
      });
      const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;

      // Create Order Header and Items
      const order = await tx.order.create({
        data: {
          orderNumber: nextOrderNumber,
          orderTitle,
          dateReceived: new Date(dateReceived),
          overallCondition: overallCondition || 'Good',
          status: status || 'IN_STOCK',
          notes: notes || '',
          encodedBy: encodedBy || req.user.fullName,
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              category: item.category || '',
              itemType: item.itemType,
              quantityReceived: item.quantityReceived,
              quantityUsed: 0,
              quantityDeployed: 0,
              quantityReturned: 0,
              availableQuantity: item.quantityReceived,
              currentStatus: 'IN_STOCK',
              notes: item.notes || '',
            })),
          },
        },
        include: { items: true },
      });

      // Add Audit Log
      await tx.auditLog.create({
        data: {
          actionType: 'CREATE_ORDER',
          entityType: 'ORDER',
          entityId: order.id,
          beforeData: JSON.stringify({}),
          afterData: JSON.stringify(order),
          notes: `Created order #${nextOrderNumber} by ${order.encodedBy}`,
        },
      });

      return order;
    });

    res.json(result);
  }));

  // PUT /api/orders/:id
  app.put('/api/orders/:id', authenticateToken, asyncHandler(async (req: any, res) => {
    const { id } = req.params;
    const { orderTitle, dateReceived, overallCondition, status, notes, encodedBy, items } = req.body;

    if (!orderTitle || !dateReceived || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const db = getPrisma();
    const existingOrder = await db.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const updated = await db.$transaction(async (tx) => {
      // Delete items no longer in the request
      const incomingItemIds = items.filter(i => i.id).map(i => i.id);
      const itemsToDelete = existingOrder.items.filter(ei => !incomingItemIds.includes(ei.id));

      for (const dItem of itemsToDelete) {
        await tx.orderItem.delete({ where: { id: dItem.id } });
      }

      // Create or update items
      for (const item of items) {
        if (item.id) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              itemName: item.itemName,
              category: item.category || '',
              itemType: item.itemType,
              quantityReceived: item.quantityReceived,
              notes: item.notes || '',
            },
          });
        } else {
          await tx.orderItem.create({
            data: {
              orderId: id,
              itemName: item.itemName,
              category: item.category || '',
              itemType: item.itemType,
              quantityReceived: item.quantityReceived,
              quantityUsed: 0,
              quantityDeployed: 0,
              quantityReturned: 0,
              availableQuantity: item.quantityReceived,
              currentStatus: 'IN_STOCK',
              notes: item.notes || '',
            },
          });
        }
      }

      // Update Order Header
      await tx.order.update({
        where: { id },
        data: {
          orderTitle,
          dateReceived: new Date(dateReceived),
          overallCondition: overallCondition || 'Good',
          status: status || existingOrder.status,
          notes: notes || '',
          encodedBy: encodedBy || existingOrder.encodedBy,
        },
        include: { items: true },
      });

      // Recalculate balances
      await syncOrderAndItemStatuses(id, tx);

      const finalOrder = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      // Add Audit Log
      await tx.auditLog.create({
        data: {
          actionType: 'UPDATE_ORDER',
          entityType: 'ORDER',
          entityId: id,
          beforeData: JSON.stringify(existingOrder),
          afterData: JSON.stringify(finalOrder),
          notes: `Updated order #${existingOrder.orderNumber} by ${encodedBy || req.user.fullName}`,
        },
      });

      return finalOrder;
    });

    res.json(updated);
  }));

  // GET /api/orders/:id/usage
  app.get('/api/orders/:id/usage', authenticateToken, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const db = getPrisma();
    const txs = await db.usageTransaction.findMany({
      where: {
        items: {
          some: {
            orderItem: {
              orderId: id,
            },
          },
        },
      },
      include: {
        items: {
          include: {
            orderItem: true,
          },
        },
      },
      orderBy: { usageDate: 'desc' },
    });
    res.json(txs);
  }));

  // GET /api/usage (and alias /api/usages)
  const getUsagesHandler = asyncHandler(async (req: any, res: any) => {
    const { orderId } = req.query;
    let whereClause: any = {};

    if (orderId) {
      whereClause = {
        items: {
          some: {
            orderItem: {
              orderId: orderId as string,
            },
          },
        },
      };
    }

    const db = getPrisma();
    const txs = await db.usageTransaction.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            orderItem: {
              include: {
                order: true,
              },
            },
          },
        },
      },
      orderBy: { usageDate: 'desc' },
    });

    res.json(txs);
  });
  app.get('/api/usage', authenticateToken, getUsagesHandler);
  app.get('/api/usages', authenticateToken, getUsagesHandler);

  // POST /api/usage (and alias /api/usages)
  const postUsageHandler = asyncHandler(async (req: any, res: any) => {
    const {
      usageDate,
      usageType,
      eventName,
      venue,
      officeUseDetails,
      employeeName,
      employeeDepartment,
      reason,
      notes,
      encodedBy,
      items,
    } = req.body;

    if (!usageDate || !usageType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required usage fields.' });
    }

    const validatedItems = items.filter((i: any) => i.quantity > 0);
    if (validatedItems.length === 0) {
      return res.status(400).json({ error: 'At least one item with quantity greater than zero is required.' });
    }

    const db = getPrisma();
    const result = await db.$transaction(async (tx) => {
      // Validate stock availability
      for (const item of validatedItems) {
        const dbItem = await tx.orderItem.findUnique({
          where: { id: item.orderItemId },
        });
        if (!dbItem) {
          throw new Error(`Item not found.`);
        }
        if (dbItem.availableQuantity < item.quantity) {
          throw new Error(`Insufficient stock for item "${dbItem.itemName}". Available: ${dbItem.availableQuantity}, Requested: ${item.quantity}.`);
        }
      }

      // Create Usage Transaction
      const transaction = await tx.usageTransaction.create({
        data: {
          usageDate: new Date(usageDate),
          usageType,
          eventName: usageType === 'EVENT' ? eventName : null,
          venue: usageType === 'EVENT' ? venue : null,
          officeUseDetails: usageType === 'OFFICE' ? officeUseDetails : null,
          employeeName: usageType === 'EMPLOYEE_REPLACEMENT' ? employeeName : null,
          employeeDepartment: usageType === 'EMPLOYEE_REPLACEMENT' ? employeeDepartment : null,
          reason: usageType === 'EMPLOYEE_REPLACEMENT' ? reason : null,
          notes: notes || '',
          encodedBy: encodedBy || req.user.fullName,
          status: 'ACTIVE',
          items: {
            create: validatedItems.map((i: any) => ({
              orderItemId: i.orderItemId,
              quantity: i.quantity,
              itemNotes: i.notes || '',
            })),
          },
        },
        include: {
          items: {
            include: {
              orderItem: true,
            },
          },
        },
      });

      // Sync affected item balances and parent orders
      const affectedOrderIds = new Set<string>();
      for (const i of transaction.items) {
        affectedOrderIds.add(i.orderItem.orderId);
      }

      for (const orderId of affectedOrderIds) {
        await syncOrderAndItemStatuses(orderId, tx);
      }

      // Log Audit Log
      await tx.auditLog.create({
        data: {
          actionType: 'CREATE_USAGE',
          entityType: 'USAGE_TRANSACTION',
          entityId: transaction.id,
          beforeData: JSON.stringify({}),
          afterData: JSON.stringify(transaction),
          notes: `Recorded stock usage (${usageType}) by ${encodedBy || req.user.fullName}`,
        },
      });

      return transaction;
    });

    res.json(result);
  });
  app.post('/api/usage', authenticateToken, postUsageHandler);
  app.post('/api/usages', authenticateToken, postUsageHandler);

  // PUT /api/usage/:id (and alias /api/usages/:id)
  const putUsageHandlerInner = async (req: any, res: any) => {
    const { id } = req.params;
    const { notes, status } = req.body;

    const db = getPrisma();
    const existing = await db.usageTransaction.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Usage record not found.' });
    }

    const updated = await db.$transaction(async (tx) => {
      const nextStatus = status !== undefined ? status : existing.status;

      const updatedTx = await tx.usageTransaction.update({
        where: { id },
        data: {
          notes: notes !== undefined ? notes : existing.notes,
          status: nextStatus,
        },
        include: { items: { include: { orderItem: true } } },
      });

      // Recalculate affected balances
      const affectedOrderIds = new Set<string>();
      for (const i of existing.items) {
        affectedOrderIds.add(i.orderItem.orderId);
      }

      for (const orderId of affectedOrderIds) {
        await syncOrderAndItemStatuses(orderId, tx);
      }

      const finalTx = await tx.usageTransaction.findUnique({
        where: { id },
        include: { items: { include: { orderItem: true } } },
      });

      // Log Audit Log
      await tx.auditLog.create({
        data: {
          actionType: nextStatus === 'VOIDED' ? 'VOID_USAGE' : 'UPDATE_USAGE',
          entityType: 'USAGE_TRANSACTION',
          entityId: id,
          beforeData: JSON.stringify(existing),
          afterData: JSON.stringify(finalTx),
          notes: nextStatus === 'VOIDED' ? `Voided usage transaction by guest` : `Updated usage transaction by guest`,
        },
      });

      return finalTx;
    });

    res.json(updated);
  };

  const putUsageHandler = asyncHandler(putUsageHandlerInner);
  app.put('/api/usage/:id', authenticateToken, putUsageHandler);
  app.put('/api/usages/:id', authenticateToken, putUsageHandler);

  // void legacy post helper
  app.post('/api/usages/:id/void', authenticateToken, asyncHandler(async (req, res) => {
    req.body.status = 'VOIDED';
    await putUsageHandlerInner(req, res);
  }));

  // GET /api/usage/:id
  const getUsageDetailsHandler = asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const db = getPrisma();
    const tx = await db.usageTransaction.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            orderItem: {
              include: {
                order: true,
              },
            },
          },
        },
      },
    });
    if (!tx) {
      return res.status(404).json({ error: 'Usage transaction not found' });
    }
    res.json(tx);
  });
  app.get('/api/usage/:id', authenticateToken, getUsageDetailsHandler);
  app.get('/api/usages/:id', authenticateToken, getUsageDetailsHandler);

  // Get audit history logs
  app.get('/api/audit-logs', authenticateToken, asyncHandler(async (req, res) => {
    const db = getPrisma();
    const logs = await db.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
    });
    res.json(logs);
  }));

  // For unknown /api/* routes, return JSON HTTP 404
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      code: "ROUTE_NOT_FOUND",
      message: "Route not found"
    });
  });

  // --- VITE DEV SERVER MIDDLEWARE INTEGRATION / STATIC ASSET SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Express full-stack server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Express backend:', err);
});
