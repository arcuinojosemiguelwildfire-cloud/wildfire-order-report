import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './src/db/client.ts';
import { seedDatabase } from './src/db/seed.ts';

// Set Timezone to Asia/Manila for dates
process.env.TZ = 'Asia/Manila';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'event-tracker-secret-key-12345';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Run database migrations/sync and seeding
  await seedDatabase();

  // Authentication Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication token is required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || !user.isActive) {
        return res.status(403).json({ error: 'User is inactive or does not exist' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // --- AUTH ENDPOINTS ---

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
      },
    });
  });

  // --- REFS / DROPDOWNS ENDPOINTS ---

  // Suppliers
  app.get('/api/suppliers', authenticateToken, async (req, res) => {
    const suppliers = await prisma.supplier.findMany({ orderBy: { supplierName: 'asc' } });
    res.json(suppliers);
  });

  app.post('/api/suppliers', authenticateToken, requireAdmin, async (req, res) => {
    const { supplierName, contactPerson, contactNumber, notes } = req.body;
    if (!supplierName) return res.status(400).json({ error: 'Supplier name is required' });

    const supplier = await prisma.supplier.create({
      data: { supplierName, contactPerson: contactPerson || '', contactNumber: contactNumber || '', notes },
    });
    res.json(supplier);
  });

  // Events
  app.get('/api/events', authenticateToken, async (req, res) => {
    const events = await prisma.event.findMany({ orderBy: { eventDate: 'desc' } });
    res.json(events);
  });

  app.post('/api/events', authenticateToken, requireAdmin, async (req, res) => {
    const { eventName, clientName, eventDate, venue, status, notes } = req.body;
    if (!eventName || !clientName || !eventDate || !venue) {
      return res.status(400).json({ error: 'Event name, client, date, and venue are required' });
    }
    const event = await prisma.event.create({
      data: { eventName, clientName, eventDate: new Date(eventDate), venue, status: status || 'Active', notes },
    });
    res.json(event);
  });

  // Employees
  app.get('/api/employees', authenticateToken, async (req, res) => {
    const employees = await prisma.employee.findMany({ orderBy: { fullName: 'asc' } });
    res.json(employees);
  });

  app.post('/api/employees', authenticateToken, requireAdmin, async (req, res) => {
    const { fullName, department, contactNumber, notes } = req.body;
    if (!fullName || !department) return res.status(400).json({ error: 'Full name and department are required' });

    const employee = await prisma.employee.create({
      data: { fullName, department, contactNumber: contactNumber || '', notes },
    });
    res.json(employee);
  });

  // Office Locations
  app.get('/api/office-locations', authenticateToken, async (req, res) => {
    const locations = await prisma.officeLocation.findMany({ orderBy: { locationName: 'asc' } });
    res.json(locations);
  });

  app.post('/api/office-locations', authenticateToken, requireAdmin, async (req, res) => {
    const { locationName, department, description } = req.body;
    if (!locationName || !department) return res.status(400).json({ error: 'Location name and department are required' });

    const location = await prisma.officeLocation.create({
      data: { locationName, department, description },
    });
    res.json(location);
  });

  // --- ITEM BALANCE CALCULATION LOGIC ---

  // Helper to calculate exact balances of all items in an order
  const getOrderBalances = async (orderId: string) => {
    const items = await prisma.orderItem.findMany({
      where: { orderId },
      include: {
        transactionItems: {
          include: {
            usageTransaction: true,
          },
        },
      },
    });

    return items.map((item) => {
      // Filter only ACTIVE transactions
      const activeTransItems = item.transactionItems.filter(
        (tItem) => tItem.usageTransaction.status === 'ACTIVE'
      );

      let qtyUsed = 0;
      let qtyTemporarilyIssued = 0;
      let qtyReturned = 0;
      let qtyDamaged = 0;
      let qtyAdjustmentIn = 0;

      activeTransItems.forEach((tItem) => {
        const qty = tItem.quantity;
        if (tItem.movementType === 'CONSUMED' || tItem.movementType === 'REPLACED' || tItem.movementType === 'ADJUSTMENT_OUT') {
          qtyUsed += qty;
        } else if (tItem.movementType === 'TEMPORARY_ISSUE') {
          qtyTemporarilyIssued += qty;
        } else if (tItem.movementType === 'RETURNED') {
          qtyReturned += qty;
        } else if (tItem.movementType === 'DAMAGED' || tItem.movementType === 'LOST') {
          qtyDamaged += qty;
        } else if (tItem.movementType === 'ADJUSTMENT_IN') {
          qtyAdjustmentIn += qty;
        }
      });

      const qtyCurrentlyDeployed = item.itemType === 'REUSABLE' ? (qtyTemporarilyIssued - qtyReturned) : 0;
      let qtyAvailable = 0;

      if (item.itemType === 'CONSUMABLE') {
        qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyUsed - qtyDamaged;
      } else {
        qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyCurrentlyDeployed - qtyDamaged;
      }

      // Live status determinations
      let status = 'In Stock';
      if (qtyAvailable === 0) {
        status = item.itemType === 'CONSUMABLE' ? 'Fully Used' : 'Out of Stock';
      } else if (qtyAvailable <= item.minimumStock) {
        status = 'Low Stock';
      } else if (item.itemType === 'REUSABLE') {
        if (qtyCurrentlyDeployed > 0 && qtyAvailable > 0) {
          status = 'Partially Deployed';
        } else if (qtyCurrentlyDeployed > 0 && qtyAvailable === 0) {
          status = 'Deployed';
        }
      }

      if (qtyCurrentlyDeployed > 0 && item.itemType === 'REUSABLE') {
        status = 'Pending Return';
      }

      if (qtyDamaged > 0 && qtyAvailable === 0) {
        status = 'Damaged / Lost';
      }

      return {
        ...item,
        qtyUsed,
        qtyDeployed: qtyCurrentlyDeployed,
        qtyReturned,
        qtyDamaged,
        qtyAvailable,
        liveStatus: status,
      };
    });
  };

  // Helper to fetch single order item balance
  const getSingleItemBalance = async (orderItemId: string) => {
    const item = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        transactionItems: {
          include: {
            usageTransaction: true,
          },
        },
      },
    });

    if (!item) return null;

    const activeTransItems = item.transactionItems.filter(
      (tItem) => tItem.usageTransaction.status === 'ACTIVE'
    );

    let qtyUsed = 0;
    let qtyTemporarilyIssued = 0;
    let qtyReturned = 0;
    let qtyDamaged = 0;
    let qtyAdjustmentIn = 0;

    activeTransItems.forEach((tItem) => {
      const qty = tItem.quantity;
      if (tItem.movementType === 'CONSUMED' || tItem.movementType === 'REPLACED' || tItem.movementType === 'ADJUSTMENT_OUT') {
        qtyUsed += qty;
      } else if (tItem.movementType === 'TEMPORARY_ISSUE') {
        qtyTemporarilyIssued += qty;
      } else if (tItem.movementType === 'RETURNED') {
        qtyReturned += qty;
      } else if (tItem.movementType === 'DAMAGED' || tItem.movementType === 'LOST') {
        qtyDamaged += qty;
      } else if (tItem.movementType === 'ADJUSTMENT_IN') {
        qtyAdjustmentIn += qty;
      }
    });

    const qtyCurrentlyDeployed = item.itemType === 'REUSABLE' ? (qtyTemporarilyIssued - qtyReturned) : 0;
    let qtyAvailable = 0;

    if (item.itemType === 'CONSUMABLE') {
      qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyUsed - qtyDamaged;
    } else {
      qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyCurrentlyDeployed - qtyDamaged;
    }

    let status = 'In Stock';
    if (qtyAvailable === 0) {
      status = item.itemType === 'CONSUMABLE' ? 'Fully Used' : 'Out of Stock';
    } else if (qtyAvailable <= item.minimumStock) {
      status = 'Low Stock';
    } else if (item.itemType === 'REUSABLE') {
      if (qtyCurrentlyDeployed > 0 && qtyAvailable > 0) {
        status = 'Partially Deployed';
      } else if (qtyCurrentlyDeployed > 0 && qtyAvailable === 0) {
        status = 'Deployed';
      }
    }

    if (qtyCurrentlyDeployed > 0 && item.itemType === 'REUSABLE') {
      status = 'Pending Return';
    }

    if (qtyDamaged > 0 && qtyAvailable === 0) {
      status = 'Damaged / Lost';
    }

    return {
      ...item,
      qtyUsed,
      qtyDeployed: qtyCurrentlyDeployed,
      qtyReturned,
      qtyDamaged,
      qtyAvailable,
      liveStatus: status,
    };
  };

  // --- ORDERS API ---

  // Get all orders with supplier details and calculated metrics
  app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
      const { search, supplierId, status } = req.query;

      let whereClause: any = {};
      if (supplierId) {
        whereClause.supplierId = supplierId as string;
      }
      if (search) {
        whereClause.OR = [
          { orderNumber: { contains: search as string } },
          { orderTitle: { contains: search as string } },
        ];
      }

      const dbOrders = await prisma.order.findMany({
        where: whereClause,
        include: {
          supplier: true,
          items: true,
        },
        orderBy: { dateReceived: 'desc' },
      });

      // Calculate stock balances for each order item and aggregate
      const ordersWithCalculatedMetrics = await Promise.all(
        dbOrders.map(async (order) => {
          const calculatedItems = await getOrderBalances(order.id);
          const totalReceived = calculatedItems.reduce((acc, item) => acc + item.quantityReceived, 0);
          const totalAvailable = calculatedItems.reduce((acc, item) => acc + item.qtyAvailable, 0);
          const totalDeployed = calculatedItems.reduce((acc, item) => acc + item.qtyDeployed, 0);

          // Calculate status dynamically or fallback
          let dynamicStatus = order.status; // Available, Partially Used, Fully Used, Closed
          if (order.status !== 'Closed') {
            if (totalAvailable === totalReceived) {
              dynamicStatus = 'Available';
            } else if (totalAvailable === 0) {
              dynamicStatus = 'Fully Used';
            } else {
              dynamicStatus = 'Partially Used';
            }

            // Check if any reusable item is pending return
            const hasPendingReturns = calculatedItems.some(
              (item) => item.itemType === 'REUSABLE' && item.qtyDeployed > 0
            );
            if (hasPendingReturns) {
              dynamicStatus = 'Partially Used'; // Keep it active
            }
          }

          return {
            id: order.id,
            orderNumber: order.orderNumber,
            orderTitle: order.orderTitle,
            supplierName: order.supplier.supplierName,
            dateReceived: order.dateReceived,
            qtyReceived: totalReceived,
            qtyAvailable: totalAvailable,
            condition: order.overallCondition,
            status: dynamicStatus,
          };
        })
      );

      // Filter by status if specified
      let filtered = ordersWithCalculatedMetrics;
      if (status) {
        filtered = ordersWithCalculatedMetrics.filter(o => o.status === status);
      }

      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single order with calculated item balances
  app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: {
          supplier: true,
          creator: true,
        },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const calculatedItems = await getOrderBalances(order.id);

      res.json({
        ...order,
        items: calculatedItems,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new order (Admin only)
  app.post('/api/orders', authenticateToken, requireAdmin, async (req: any, res) => {
    const {
      orderNumber,
      orderTitle,
      supplierId,
      poOrInvoiceNumber,
      dateOrdered,
      dateReceived,
      overallCondition,
      notes,
      items,
    } = req.body;

    if (!orderNumber || !orderTitle || !supplierId || !poOrInvoiceNumber || !dateOrdered || !dateReceived || !overallCondition) {
      return res.status(400).json({ error: 'Missing required order details' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item line is required' });
    }

    try {
      // Check unique order number
      const existing = await prisma.order.findUnique({ where: { orderNumber } });
      if (existing) {
        return res.status(400).json({ error: `Order Number "${orderNumber}" already exists.` });
      }

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            orderTitle,
            supplierId,
            poOrInvoiceNumber,
            dateOrdered: new Date(dateOrdered),
            dateReceived: new Date(dateReceived),
            overallCondition,
            status: 'Available',
            notes,
            createdBy: req.user.id,
            items: {
              create: items.map((item: any) => ({
                itemName: item.itemName,
                category: item.category,
                unit: item.unit,
                itemType: item.itemType, // CONSUMABLE or REUSABLE
                quantityReceived: parseInt(item.quantityReceived, 10),
                minimumStock: parseInt(item.minimumStock, 10) || 0,
                condition: item.condition || 'New',
                storageLocation: item.storageLocation,
                unitCost: item.unitCost ? parseFloat(item.unitCost) : null,
                notes: item.notes,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actionType: 'CREATE_ORDER',
            entityType: 'ORDER',
            entityId: order.id,
            oldValues: '{}',
            newValues: JSON.stringify(order),
            remarks: `Created order ${order.orderNumber}`,
          },
        });

        return order;
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update existing order (Admin only)
  app.put('/api/orders/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    const { id } = req.params;
    const {
      orderNumber,
      orderTitle,
      supplierId,
      poOrInvoiceNumber,
      dateOrdered,
      dateReceived,
      overallCondition,
      status,
      notes,
      items,
    } = req.body;

    try {
      const existingOrder = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Check orderNumber uniqueness if changed
      if (orderNumber !== existingOrder.orderNumber) {
        const dup = await prisma.order.findUnique({ where: { orderNumber } });
        if (dup) {
          return res.status(400).json({ error: `Order Number "${orderNumber}" already exists.` });
        }
      }

      // Check: Quantity received cannot be reduced below already recorded usage
      // Get currently calculated balances of the items
      const calculatedItems = await getOrderBalances(id);

      for (const item of items) {
        if (item.id) {
          const calc = calculatedItems.find((ci) => ci.id === item.id);
          if (calc) {
            const recordedUsage = calc.quantityReceived - calc.qtyAvailable;
            const newQty = parseInt(item.quantityReceived, 10);
            if (newQty < recordedUsage) {
              return res.status(400).json({
                error: `Cannot reduce quantity of item "${calc.itemName}" below its recorded usage of ${recordedUsage}. Current input: ${newQty}`,
              });
            }
          }
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Update basic order properties
        const order = await tx.order.update({
          where: { id },
          data: {
            orderNumber,
            orderTitle,
            supplierId,
            poOrInvoiceNumber,
            dateOrdered: new Date(dateOrdered),
            dateReceived: new Date(dateReceived),
            overallCondition,
            status,
            notes,
          },
        });

        // 2. Handle item updates, inserts, deletions
        const incomingItemIds = items.map((i: any) => i.id).filter(Boolean);
        const existingItemIds = existingOrder.items.map((i) => i.id);

        // Deletions: find items that are not in incoming list
        const itemsToDelete = existingItemIds.filter((id) => !incomingItemIds.includes(id));
        if (itemsToDelete.length > 0) {
          // Verify that these items have no transactions!
          const hasTx = await tx.usageTransactionItem.findFirst({
            where: { orderItemId: { in: itemsToDelete } },
          });
          if (hasTx) {
            throw new Error('Cannot delete order items that have recorded usage transactions.');
          }
          await tx.orderItem.deleteMany({
            where: { id: { in: itemsToDelete } },
          });
        }

        // Updates / Inserts
        for (const item of items) {
          if (item.id) {
            // Update
            await tx.orderItem.update({
              where: { id: item.id },
              data: {
                itemName: item.itemName,
                category: item.category,
                unit: item.unit,
                itemType: item.itemType,
                quantityReceived: parseInt(item.quantityReceived, 10),
                minimumStock: parseInt(item.minimumStock, 10) || 0,
                condition: item.condition,
                storageLocation: item.storageLocation,
                unitCost: item.unitCost ? parseFloat(item.unitCost) : null,
                notes: item.notes,
              },
            });
          } else {
            // Insert
            await tx.orderItem.create({
              data: {
                orderId: id,
                itemName: item.itemName,
                category: item.category,
                unit: item.unit,
                itemType: item.itemType,
                quantityReceived: parseInt(item.quantityReceived, 10),
                minimumStock: parseInt(item.minimumStock, 10) || 0,
                condition: item.condition || 'New',
                storageLocation: item.storageLocation,
                unitCost: item.unitCost ? parseFloat(item.unitCost) : null,
                notes: item.notes,
              },
            });
          }
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actionType: 'UPDATE_ORDER',
            entityType: 'ORDER',
            entityId: order.id,
            oldValues: JSON.stringify(existingOrder),
            newValues: JSON.stringify(order),
            remarks: `Updated order ${order.orderNumber}`,
          },
        });

        return order;
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- USAGE RECORDING & LEDGER ENDPOINTS ---

  // Get complete usage transactions ledger
  app.get('/api/usages', authenticateToken, async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        usageType,
        eventId,
        employeeId,
        officeLocationId,
        search,
      } = req.query;

      let whereClause: any = {};

      if (usageType) {
        whereClause.usageType = usageType as string;
      }
      if (eventId) {
        whereClause.eventId = eventId as string;
      }
      if (employeeId) {
        whereClause.employeeId = employeeId as string;
      }
      if (officeLocationId) {
        whereClause.officeLocationId = officeLocationId as string;
      }

      if (startDate && endDate) {
        whereClause.usageDate = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      if (search) {
        whereClause.OR = [
          { usageReference: { contains: search as string } },
          { reason: { contains: search as string } },
          { notes: { contains: search as string } },
        ];
      }

      const usages = await prisma.usageTransaction.findMany({
        where: whereClause,
        include: {
          event: true,
          employee: true,
          officeLocation: true,
          creator: true,
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

      res.json(usages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single usage details
  app.get('/api/usages/:id', authenticateToken, async (req, res) => {
    const usage = await prisma.usageTransaction.findUnique({
      where: { id: req.params.id },
      include: {
        event: true,
        employee: true,
        officeLocation: true,
        creator: true,
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

    if (!usage) {
      return res.status(404).json({ error: 'Usage transaction not found' });
    }

    // Get audit logs for this transaction
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'USAGE_TRANSACTION', entityId: usage.id },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ...usage,
      auditLogs: logs,
    });
  });

  // Record a usage entry (Admin or Encoder)
  app.post('/api/usages', authenticateToken, async (req: any, res) => {
    const {
      usageDate,
      usageType, // EVENT, OFFICE, EMPLOYEE_REPLACEMENT, DAMAGE_LOSS, RETURN, ADJUSTMENT
      eventId,
      employeeId,
      officeLocationId,
      reason,
      notes,
      items, // array of { orderItemId, quantity, movementType, itemCondition, notes }
    } = req.body;

    if (!usageDate || !usageType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required usage fields' });
    }

    try {
      // 1. Generate unique Usage Reference Number: USG-YYYYMMDD-XXXX
      const dateStr = new Date(usageDate).toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = await prisma.usageTransaction.count({
        where: {
          usageReference: { startsWith: `USG-${dateStr}` },
        },
      });
      const seqStr = String(countToday + 1).padStart(4, '0');
      const usageReference = `USG-${dateStr}-${seqStr}`;

      const transactionResult = await prisma.$transaction(async (tx) => {
        // Validation loop: Pre-check stock levels
        for (const line of items) {
          const qty = parseInt(line.quantity, 10);
          if (qty <= 0) {
            throw new Error(`Quantity must be greater than zero for item selection.`);
          }

          // Let's get current balance of this item inside the transaction context
          const item = await tx.orderItem.findUnique({
            where: { id: line.orderItemId },
            include: {
              transactionItems: {
                include: {
                  usageTransaction: true,
                },
              },
            },
          });

          if (!item) {
            throw new Error(`Item selection not found: ${line.orderItemId}`);
          }

          const activeTransItems = item.transactionItems.filter(
            (tItem) => tItem.usageTransaction.status === 'ACTIVE'
          );

          let qtyUsed = 0;
          let qtyTemporarilyIssued = 0;
          let qtyReturned = 0;
          let qtyDamaged = 0;
          let qtyAdjustmentIn = 0;

          activeTransItems.forEach((tItem) => {
            const q = tItem.quantity;
            if (tItem.movementType === 'CONSUMED' || tItem.movementType === 'REPLACED' || tItem.movementType === 'ADJUSTMENT_OUT') {
              qtyUsed += q;
            } else if (tItem.movementType === 'TEMPORARY_ISSUE') {
              qtyTemporarilyIssued += q;
            } else if (tItem.movementType === 'RETURNED') {
              qtyReturned += q;
            } else if (tItem.movementType === 'DAMAGED' || tItem.movementType === 'LOST') {
              qtyDamaged += q;
            } else if (tItem.movementType === 'ADJUSTMENT_IN') {
              qtyAdjustmentIn += q;
            }
          });

          const qtyCurrentlyDeployed = item.itemType === 'REUSABLE' ? (qtyTemporarilyIssued - qtyReturned) : 0;
          let qtyAvailable = 0;

          if (item.itemType === 'CONSUMABLE') {
            qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyUsed - qtyDamaged;
          } else {
            qtyAvailable = item.quantityReceived + qtyAdjustmentIn - qtyCurrentlyDeployed - qtyDamaged;
          }

          // Check if this is a return transaction
          if (usageType === 'RETURN') {
            if (item.itemType !== 'REUSABLE') {
              throw new Error(`Cannot record a return for consumable item: ${item.itemName}`);
            }
            // For a return, we must require the original event usage reference
            if (!reason) {
              throw new Error('Original event usage reference is required for returning items.');
            }

            // Find the original event use record
            const originalUsg = await tx.usageTransaction.findFirst({
              where: { usageReference: reason, status: 'ACTIVE' },
              include: { items: true },
            });

            if (!originalUsg) {
              throw new Error(`Original event usage reference "${reason}" not found or voided.`);
            }

            const originalLine = originalUsg.items.find(i => i.orderItemId === item.id && i.movementType === 'TEMPORARY_ISSUE');
            if (!originalLine) {
              throw new Error(`This item "${item.itemName}" was not part of the original event usage "${reason}".`);
            }

            // Sum up previous returns for this item from this original usage
            const previousReturns = await tx.usageTransactionItem.findMany({
              where: {
                orderItemId: item.id,
                movementType: 'RETURNED',
                usageTransaction: {
                  reason: reason,
                  status: 'ACTIVE',
                },
              },
            });

            const totalPrevReturned = previousReturns.reduce((sum, ri) => sum + ri.quantity, 0);
            const remainingToReturn = originalLine.quantity - totalPrevReturned;

            if (qty > remainingToReturn) {
              throw new Error(
                `Returned quantity (${qty}) exceeds remaining outstanding deployed quantity (${remainingToReturn}) for item "${item.itemName}". Issued: ${originalLine.quantity}, Previously Returned: ${totalPrevReturned}`
              );
            }
          } else {
            // Normal deduction transaction: verify we have enough stock available
            if (qty > qtyAvailable) {
              throw new Error(
                `Requested quantity of ${qty} for "${item.itemName}" exceeds available stock of ${qtyAvailable}.`
              );
            }
          }
        }

        // 2. Create the usage transaction record
        const usage = await tx.usageTransaction.create({
          data: {
            usageReference,
            usageDate: new Date(usageDate),
            usageType,
            eventId: eventId || null,
            employeeId: employeeId || null,
            officeLocationId: officeLocationId || null,
            reason: reason || null,
            notes,
            status: 'ACTIVE',
            createdBy: req.user.id,
          },
        });

        // 3. Create individual items lines
        for (const line of items) {
          await tx.usageTransactionItem.create({
            data: {
              usageTransactionId: usage.id,
              orderItemId: line.orderItemId,
              quantity: parseInt(line.quantity, 10),
              movementType: line.movementType, // CONSUMED, TEMPORARY_ISSUE, RETURNED, DAMAGED, REPLACED, etc.
              itemCondition: line.itemCondition || 'Good',
              notes: line.notes,
            },
          });
        }

        // 4. Audit Log
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actionType: 'RECORD_USAGE',
            entityType: 'USAGE_TRANSACTION',
            entityId: usage.id,
            oldValues: '{}',
            newValues: JSON.stringify(usage),
            remarks: `Recorded usage reference ${usage.usageReference} (${usageType})`,
          },
        });

        return usage;
      });

      res.json(transactionResult);
    } catch (error: any) {
      console.error('Usage creation failed:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Void a usage record (Admin only)
  app.post('/api/usages/:id/void', authenticateToken, requireAdmin, async (req: any, res) => {
    const { id } = req.params;
    const { voidReason } = req.body;

    if (!voidReason) {
      return res.status(400).json({ error: 'Void reason is mandatory.' });
    }

    try {
      const existing = await prisma.usageTransaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Usage record not found' });
      }

      if (existing.status === 'VOIDED') {
        return res.status(400).json({ error: 'Usage record is already voided.' });
      }

      // If it's an Event Use (TEMPORARY_ISSUE) for reusable items, let's verify if they have been returned.
      // If some have already been returned, voiding the event use is dangerous!
      if (existing.usageType === 'EVENT') {
        // Check if there are active returns linked to this Event Use
        const returns = await prisma.usageTransaction.findMany({
          where: {
            reason: existing.usageReference,
            status: 'ACTIVE',
          },
        });

        if (returns.length > 0) {
          return res.status(400).json({
            error: `Cannot void event usage "${existing.usageReference}" because some reusable items have already been returned via Return record(s): ${returns.map(r => r.usageReference).join(', ')}. Void the return records first.`,
          });
        }
      }

      const voided = await prisma.$transaction(async (tx) => {
        const usage = await tx.usageTransaction.update({
          where: { id },
          data: {
            status: 'VOIDED',
            voidReason,
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actionType: 'VOID_USAGE',
            entityType: 'USAGE_TRANSACTION',
            entityId: usage.id,
            oldValues: JSON.stringify(existing),
            newValues: JSON.stringify(usage),
            remarks: `Voided usage ${usage.usageReference}. Reason: ${voidReason}`,
          },
        });

        return usage;
      });

      res.json(voided);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Edit/Update usage record
  // Encoder can only edit same-day usage, Admin can edit any
  app.put('/api/usages/:id', authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const { notes } = req.body; // Normally, can only update notes/reason to avoid breaking historical stocks, or full edit with validation.

    try {
      const existing = await prisma.usageTransaction.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Usage record not found' });
      }

      // Check role authorization for edit date constraints
      if (req.user.role !== 'ADMIN') {
        const createdDate = new Date(existing.createdAt).toDateString();
        const todayDate = new Date().toDateString();
        if (createdDate !== todayDate) {
          return res.status(403).json({ error: 'Encoders are only permitted to edit their own same-day usage records.' });
        }
        if (existing.createdBy !== req.user.id) {
          return res.status(403).json({ error: 'You can only edit your own usage records.' });
        }
      }

      const updated = await prisma.usageTransaction.update({
        where: { id },
        data: {
          notes,
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: 'EDIT_USAGE',
          entityType: 'USAGE_TRANSACTION',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
          remarks: `Updated notes on usage transaction ${existing.usageReference}`,
        },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- DASHBOARD API ---

  app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          },
        };
      }

      // 1. Total Items Received
      const orderItems = await prisma.orderItem.findMany();
      const totalReceived = orderItems.reduce((sum, item) => sum + item.quantityReceived, 0);

      // 2. Available in Stock & Low Stock Items
      // Get balances for all items in the database
      const allItems = await prisma.orderItem.findMany({
        include: {
          transactionItems: {
            include: {
              usageTransaction: true,
            },
          },
        },
      });

      let totalAvailable = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      let currentlyDeployed = 0;

      allItems.forEach((item) => {
        const activeTransItems = item.transactionItems.filter(
          (tItem) => tItem.usageTransaction.status === 'ACTIVE'
        );

        let qtyUsed = 0;
        let qtyTemporarilyIssued = 0;
        let qtyReturned = 0;
        let qtyDamaged = 0;
        let qtyAdjustmentIn = 0;

        activeTransItems.forEach((tItem) => {
          const q = tItem.quantity;
          if (tItem.movementType === 'CONSUMED' || tItem.movementType === 'REPLACED' || tItem.movementType === 'ADJUSTMENT_OUT') {
            qtyUsed += q;
          } else if (tItem.movementType === 'TEMPORARY_ISSUE') {
            qtyTemporarilyIssued += q;
          } else if (tItem.movementType === 'RETURNED') {
            qtyReturned += q;
          } else if (tItem.movementType === 'DAMAGED' || tItem.movementType === 'LOST') {
            qtyDamaged += q;
          } else if (tItem.movementType === 'ADJUSTMENT_IN') {
            qtyAdjustmentIn += q;
          }
        });

        const qtyCurrentlyDeployed = item.itemType === 'REUSABLE' ? (qtyTemporarilyIssued - qtyReturned) : 0;
        let itemAvailable = 0;

        if (item.itemType === 'CONSUMABLE') {
          itemAvailable = item.quantityReceived + qtyAdjustmentIn - qtyUsed - qtyDamaged;
        } else {
          itemAvailable = item.quantityReceived + qtyAdjustmentIn - qtyCurrentlyDeployed - qtyDamaged;
        }

        totalAvailable += itemAvailable;
        currentlyDeployed += qtyCurrentlyDeployed;

        if (itemAvailable === 0) {
          outOfStockCount++;
        } else if (itemAvailable <= item.minimumStock) {
          lowStockCount++;
        }
      });

      // 3. Total Used This Month / Filtered Range
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usageItemsQuery: any = {
        usageTransaction: {
          status: 'ACTIVE',
        },
      };

      if (startDate && endDate) {
        usageItemsQuery.usageTransaction.usageDate = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      } else {
        usageItemsQuery.usageTransaction.usageDate = {
          gte: startOfMonth,
        };
      }

      const activeUsageItems = await prisma.usageTransactionItem.findMany({
        where: usageItemsQuery,
      });

      const totalUsedThisMonth = activeUsageItems
        .filter(item => ['CONSUMED', 'REPLACED', 'DAMAGED', 'LOST'].includes(item.movementType))
        .reduce((sum, item) => sum + item.quantity, 0);

      res.json({
        totalReceived,
        totalUsedThisMonth,
        totalAvailable,
        currentlyDeployed,
        lowStockItems: lowStockCount,
        outOfStockItems: outOfStockCount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get data for charts
  app.get('/api/dashboard/charts', authenticateToken, async (req, res) => {
    try {
      const activeTransactions = await prisma.usageTransaction.findMany({
        where: { status: 'ACTIVE' },
        include: {
          items: {
            include: {
              orderItem: true,
            },
          },
          event: true,
        },
      });

      // 1. Monthly Usage Trend
      const monthlyData: { [key: string]: number } = {};
      const usageByPurpose = {
        eventUse: 0,
        officeUse: 0,
        employeeReplacement: 0,
        damageLoss: 0,
        returned: 0,
      };

      const itemUsageCounts: { [key: string]: { name: string, quantity: number } } = {};
      const eventUsageCounts: { [key: string]: { name: string, quantity: number } } = {};

      activeTransactions.forEach((tx) => {
        // Date formatting: YYYY-MM
        const month = tx.usageDate.toISOString().slice(0, 7);
        const txQty = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        monthlyData[month] = (monthlyData[month] || 0) + txQty;

        // Usage by Purpose
        tx.items.forEach((line) => {
          const qty = line.quantity;
          if (tx.usageType === 'EVENT') usageByPurpose.eventUse += qty;
          else if (tx.usageType === 'OFFICE') usageByPurpose.officeUse += qty;
          else if (tx.usageType === 'EMPLOYEE_REPLACEMENT') usageByPurpose.employeeReplacement += qty;
          else if (tx.usageType === 'DAMAGE_LOSS') usageByPurpose.damageLoss += qty;
          else if (tx.usageType === 'RETURN') usageByPurpose.returned += qty;

          // Top Used Items
          const itemName = line.orderItem.itemName;
          if (!itemUsageCounts[itemName]) {
            itemUsageCounts[itemName] = { name: itemName, quantity: 0 };
          }
          if (tx.usageType !== 'RETURN') {
            itemUsageCounts[itemName].quantity += qty;
          }
        });

        // Top Events
        if (tx.usageType === 'EVENT' && tx.event) {
          const name = tx.event.eventName;
          const qty = tx.items.reduce((sum, i) => sum + i.quantity, 0);
          if (!eventUsageCounts[name]) {
            eventUsageCounts[name] = { name, quantity: 0 };
          }
          eventUsageCounts[name].quantity += qty;
        }
      });

      const trend = Object.keys(monthlyData).sort().map(month => ({
        month,
        quantity: monthlyData[month],
      }));

      const topItems = Object.values(itemUsageCounts)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const topEvents = Object.values(eventUsageCounts)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      res.json({
        trend,
        purpose: [
          { name: 'Event Use', value: usageByPurpose.eventUse },
          { name: 'Office Use', value: usageByPurpose.officeUse },
          { name: 'Employee Replacement', value: usageByPurpose.employeeReplacement },
          { name: 'Damage / Loss', value: usageByPurpose.damageLoss },
          { name: 'Returned Items', value: usageByPurpose.returned },
        ],
        topItems,
        topEvents,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- REPORTS API ---

  app.get('/api/reports/items-balances', authenticateToken, async (req, res) => {
    try {
      const orderItems = await prisma.orderItem.findMany({
        include: {
          order: true,
          transactionItems: {
            include: {
              usageTransaction: true,
            },
          },
        },
      });

      const list = await Promise.all(
        orderItems.map(async (item) => {
          const calc = await getSingleItemBalance(item.id);
          return {
            id: item.id,
            itemName: item.itemName,
            orderNumber: item.order.orderNumber,
            category: item.category,
            itemType: item.itemType,
            quantityReceived: item.quantityReceived,
            qtyUsed: calc?.qtyUsed || 0,
            qtyDeployed: calc?.qtyDeployed || 0,
            qtyReturned: calc?.qtyReturned || 0,
            qtyAvailable: calc?.qtyAvailable || 0,
            liveStatus: calc?.liveStatus || 'In Stock',
            storageLocation: item.storageLocation,
          };
        })
      );

      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get audit history logs (Admin only)
  app.get('/api/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  });

  // --- VITE DEV SERVER MIDDLEWARE INTEGRATION ---

  if (process.env.DISABLE_HMR === 'true') {
    // If running in development container
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
    // Serve static files in Production mode
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
