import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prisma } from './src/db/client.ts';
import { seedDatabase } from './src/db/seed.ts';

// Set Timezone to Asia/Manila for dates
process.env.TZ = 'Asia/Manila';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  // Run database migrations/sync and seeding
  await seedDatabase();

  // --- RECALCULATE AND STATUS SYNC ENGINE ---

  const syncOrderAndItemStatuses = async (orderId: string, tx: any) => {
    const prismaTx = tx || prisma;

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
      // IN_STOCK, OUT_OF_STOCK, PARTIALLY_DEPLOYED, DEPLOYED, FULLY_USED
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
    // IN_STOCK, PARTIALLY_DEPLOYED, DEPLOYED, FULLY_USED
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
      // partially used/deployed
      if (anyReusableDeployed) {
        orderStatus = 'PARTIALLY_DEPLOYED';
      } else {
        orderStatus = 'PARTIALLY_DEPLOYED';
      }
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

  const syncAllOrders = async () => {
    try {
      const orders = await prisma.order.findMany();
      for (const o of orders) {
        await syncOrderAndItemStatuses(o.id, null);
      }
    } catch (e) {
      console.error('Error syncing all orders:', e);
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

  // --- DATABASE URL CHECKING MIDDLEWARE ---
  const checkDatabaseUrl = (req: any, res: any, next: any) => {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        error: 'Database configuration missing. Please click the "Settings" button in the top-right corner of AI Studio, add a secret named DATABASE_URL with your Neon connection string, and restart the server.',
        isDbConfigMissing: true
      });
    }
    next();
  };

  app.use('/api', checkDatabaseUrl);

  // --- ENDPOINTS ---

  // Mock Authentication Endpoints (Bypassed frictionless access)
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
  app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
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

      // Fetch items & count stats
      const items = await prisma.orderItem.findMany();
      const totalReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
      const totalAvailable = items.reduce((sum, item) => sum + item.availableQuantity, 0);
      const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
      const outOfStockItems = items.filter(i => i.availableQuantity === 0).length;

      // Calculate total used this month/period
      const activeTxItems = await prisma.usageTransactionItem.findMany({
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
        lowStockItems: outOfStockItems, // since minimum stock is removed, treat out of stock as low stock attention
        outOfStockItems,
      };

      // Charts data
      const allTx = await prisma.usageTransaction.findMany({
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
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Supporting legacy frontend routes so they align perfectly
  app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
      const items = await prisma.orderItem.findMany();
      const totalReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
      const totalAvailable = items.reduce((sum, item) => sum + item.availableQuantity, 0);
      const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
      const outOfStockItems = items.filter(i => i.availableQuantity === 0).length;

      const activeTxItems = await prisma.usageTransactionItem.findMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/dashboard/charts', authenticateToken, async (req, res) => {
    try {
      const allTx = await prisma.usageTransaction.findMany({
        where: { status: 'ACTIVE' },
        include: { items: { include: { orderItem: true } } },
      });

      // trend
      const trendMap: Record<string, number> = {};
      allTx.forEach(tx => {
        const date = new Date(tx.usageDate);
        const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
        const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        trendMap[monthName] = (trendMap[monthName] || 0) + qtySum;
      });
      const trend = Object.entries(trendMap).map(([month, quantity]) => ({ month, quantity }));

      // purpose
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

      // topItems
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

      // topEvents
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/dashboard/low-stock', authenticateToken, async (req, res) => {
    try {
      const items = await prisma.orderItem.findMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/orders
  app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
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

      const orders = await prisma.order.findMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/orders/:id
  app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await prisma.order.findUnique({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/orders
  app.post('/api/orders', authenticateToken, async (req: any, res) => {
    try {
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

      const result = await prisma.$transaction(async (tx) => {
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
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/orders/:id
  app.put('/api/orders/:id', authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { orderTitle, dateReceived, overallCondition, status, notes, encodedBy, items } = req.body;

      if (!orderTitle || !dateReceived || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      const existingOrder = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existingOrder) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const updated = await prisma.$transaction(async (tx) => {
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
        const updatedOrder = await tx.order.update({
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
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/orders/:id/usage
  app.get('/api/orders/:id/usage', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const txs = await prisma.usageTransaction.findMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/usage (also supporting legacy /api/usages)
  const getUsagesHandler = async (req: any, res: any) => {
    try {
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

      const txs = await prisma.usageTransaction.findMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
  app.get('/api/usage', authenticateToken, getUsagesHandler);
  app.get('/api/usages', authenticateToken, getUsagesHandler);

  // POST /api/usage (also supporting legacy /api/usages)
  const postUsageHandler = async (req: any, res: any) => {
    try {
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

      const result = await prisma.$transaction(async (tx) => {
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
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  };
  app.post('/api/usage', authenticateToken, postUsageHandler);
  app.post('/api/usages', authenticateToken, postUsageHandler);

  // PUT /api/usage/:id (also supporting legacy /api/usages/:id)
  const putUsageHandler = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { notes, status } = req.body; // allow notes update or voiding

      const existing = await prisma.usageTransaction.findUnique({
        where: { id },
        include: { items: { include: { orderItem: true } } },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Usage record not found.' });
      }

      const updated = await prisma.$transaction(async (tx) => {
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
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  };
  app.put('/api/usage/:id', authenticateToken, putUsageHandler);
  app.put('/api/usages/:id', authenticateToken, putUsageHandler);

  // void legacy post helper
  app.post('/api/usages/:id/void', authenticateToken, async (req, res) => {
    req.body.status = 'VOIDED';
    await putUsageHandler(req, res);
  });

  // GET /api/usages/:id
  const getUsageDetailsHandler = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const tx = await prisma.usageTransaction.findUnique({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
  app.get('/api/usage/:id', authenticateToken, getUsageDetailsHandler);
  app.get('/api/usages/:id', authenticateToken, getUsageDetailsHandler);

  // Get audit history logs
  app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
      });
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- VITE DEV SERVER MIDDLEWARE INTEGRATION ---

  if (process.env.DISABLE_HMR === 'true') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexHtml = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const template = await vite.transformIndexHtml(url, indexHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Express full-stack server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Express backend:', err);
});
