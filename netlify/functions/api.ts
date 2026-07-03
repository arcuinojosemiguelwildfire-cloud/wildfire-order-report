import type { Config, Context } from "@netlify/functions";
import { prisma } from "../../src/db/client.ts";

process.env.TZ = "Asia/Manila";

// Status recalculate engine for serverless environments
const syncOrderAndItemStatuses = async (orderId: string, tx: any) => {
  const prismaTx = tx || prisma;

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
    const activeTransItems = item.transactionItems.filter(
      (ti: any) => ti.usageTransaction.status === "ACTIVE"
    );

    const totalQtyInTransactions = activeTransItems.reduce((acc: number, ti: any) => acc + ti.quantity, 0);

    let qtyUsed = 0;
    let qtyDeployed = 0;

    if (item.itemType === "CONSUMABLE") {
      qtyUsed = totalQtyInTransactions;
    } else {
      qtyDeployed = totalQtyInTransactions;
    }

    const availableQuantity = Math.max(0, item.quantityReceived - (item.itemType === "CONSUMABLE" ? qtyUsed : qtyDeployed));

    totalReceived += item.quantityReceived;
    totalAvailable += availableQuantity;

    if (item.itemType === "REUSABLE" && qtyDeployed > 0) {
      anyReusableDeployed = true;
    }

    let currentStatus = "IN_STOCK";
    if (item.itemType === "CONSUMABLE") {
      if (availableQuantity === 0) {
        currentStatus = "FULLY_USED";
      } else {
        currentStatus = "IN_STOCK";
      }
    } else {
      if (qtyDeployed === 0) {
        if (availableQuantity > 0) {
          currentStatus = "IN_STOCK";
        } else {
          currentStatus = "OUT_OF_STOCK";
        }
      } else {
        if (availableQuantity > 0) {
          currentStatus = "PARTIALLY_DEPLOYED";
        } else {
          currentStatus = "DEPLOYED";
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

  let orderStatus = "IN_STOCK";
  if (totalAvailable === totalReceived) {
    orderStatus = "IN_STOCK";
  } else if (totalAvailable === 0) {
    if (anyReusableDeployed) {
      orderStatus = "DEPLOYED";
    } else {
      orderStatus = "FULLY_USED";
    }
  } else {
    orderStatus = "PARTIALLY_DEPLOYED";
  }

  const currentOrder = await prismaTx.order.findUnique({ where: { id: orderId } });
  if (currentOrder && currentOrder.status !== "Closed") {
    await prismaTx.order.update({
      where: { id: orderId },
      data: {
        status: orderStatus,
      },
    });
  }
};

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Check DATABASE_URL existence
  if (!process.env.DATABASE_URL) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Database configuration is unavailable.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // 1. GET /api/health
    if (path === "/api/health" && method === "GET") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return new Response(
          JSON.stringify({
            success: true,
            message: "API is running.",
            database: "connected",
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (dbErr: any) {
        console.error("Health check database connection failed:", dbErr);
        return new Response(
          JSON.stringify({
            success: false,
            message: "API is running but database is offline.",
            database: "disconnected",
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 2. GET /api/dashboard
    if (path === "/api/dashboard" && method === "GET") {
      const items = await prisma.orderItem.findMany();
      const totalItemsReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
      const availableInStock = items.reduce((sum, item) => sum + item.availableQuantity, 0);
      const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
      const fullyUsedOrOutOfStock = items.filter(i => i.availableQuantity === 0).length;

      const allTx = await prisma.usageTransaction.findMany({
        where: { status: 'ACTIVE' },
        include: { items: { include: { orderItem: true } } },
        orderBy: { usageDate: 'asc' },
      });

      // Trend Map
      const trendMap: Record<string, number> = {};
      allTx.forEach(tx => {
        const date = new Date(tx.usageDate);
        const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' });
        const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        trendMap[monthName] = (trendMap[monthName] || 0) + qtySum;
      });
      const trend = Object.entries(trendMap).map(([month, quantity]) => ({ month, quantity }));

      // Usage by Purpose
      let eventSum = 0;
      let officeSum = 0;
      let employeeSum = 0;
      allTx.forEach(tx => {
        const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
        if (tx.usageType === 'EVENT') eventSum += qtySum;
        else if (tx.usageType === 'OFFICE') officeSum += qtySum;
        else if (tx.usageType === 'EMPLOYEE_REPLACEMENT') employeeSum += qtySum;
      });
      const usageByPurpose = [
        { name: 'Event Use', value: eventSum },
        { name: 'Office Use', value: officeSum },
        { name: 'Employee Replacement', value: employeeSum },
      ];

      // Stock Status Breakdown
      const statusMap: Record<string, number> = {};
      items.forEach(i => {
        statusMap[i.currentStatus] = (statusMap[i.currentStatus] || 0) + 1;
      });
      const stockStatusBreakdown = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

      // Top Used Items
      const itemMap: Record<string, number> = {};
      allTx.forEach(tx => {
        tx.items.forEach(i => {
          if (i.orderItem) {
            itemMap[i.orderItem.itemName] = (itemMap[i.orderItem.itemName] || 0) + i.quantity;
          }
        });
      });
      const topUsedItems = Object.entries(itemMap)
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      // Top Events by Deployment
      const eventMap: Record<string, number> = {};
      allTx.forEach(tx => {
        if (tx.usageType === 'EVENT' && tx.eventName) {
          const qtySum = tx.items.reduce((sum, i) => sum + i.quantity, 0);
          eventMap[tx.eventName] = (eventMap[tx.eventName] || 0) + qtySum;
        }
      });
      const topEventsByDeployment = Object.entries(eventMap)
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      // Recent Usage Records
      const recentUsageRecords = await prisma.usageTransaction.findMany({
        take: 5,
        orderBy: { usageDate: 'desc' },
        include: {
          items: {
            include: {
              orderItem: {
                include: {
                  order: true
                }
              }
            }
          }
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            totalItemsReceived,
            availableInStock,
            currentlyDeployed,
            fullyUsedOrOutOfStock
          },
          usageByPurpose,
          stockStatusBreakdown,
          topUsedItems,
          topEventsByDeployment,
          recentUsageRecords
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 3. GET /api/dashboard/stats
    if (path === "/api/dashboard/stats" && method === "GET") {
      const items = await prisma.orderItem.findMany();
      const totalReceived = items.reduce((sum, item) => sum + item.quantityReceived, 0);
      const totalAvailable = items.reduce((sum, item) => sum + item.availableQuantity, 0);
      const currentlyDeployed = items.filter(i => i.itemType === 'REUSABLE').reduce((sum, item) => sum + item.quantityDeployed, 0);
      const outOfStockItems = items.filter(i => i.availableQuantity === 0).length;

      const activeTxItems = await prisma.usageTransactionItem.findMany({
        where: { usageTransaction: { status: 'ACTIVE' } },
      });
      const totalUsedThisMonth = activeTxItems.reduce((sum, ti) => sum + ti.quantity, 0);

      return new Response(
        JSON.stringify({
          totalReceived,
          totalUsedThisMonth,
          totalAvailable,
          currentlyDeployed,
          pendingReturn: 0,
          lowStockItems: outOfStockItems,
          outOfStockItems,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 4. GET /api/dashboard/charts
    if (path === "/api/dashboard/charts" && method === "GET") {
      const allTx = await prisma.usageTransaction.findMany({
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

      return new Response(
        JSON.stringify({ trend, purpose, topItems, topEvents }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 5. GET /api/dashboard/low-stock
    if (path === "/api/dashboard/low-stock" && method === "GET") {
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
      return new Response(JSON.stringify(list), { status: 200, headers: corsHeaders });
    }

    // 6. GET /api/orders
    if (path === "/api/orders" && method === "GET") {
      const search = url.searchParams.get("search");
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

      return new Response(JSON.stringify(formattedOrders), { status: 200, headers: corsHeaders });
    }

    // 7. POST /api/orders
    if (path === "/api/orders" && method === "POST") {
      const body = await req.json();
      const { orderTitle, dateReceived, overallCondition, status, notes, encodedBy, items } = body;

      if (!orderTitle || !dateReceived || !items || !Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing required order header or item fields.' }), { status: 400, headers: corsHeaders });
      }

      for (const i of items) {
        if (!i.itemName || !i.itemType || !i.quantityReceived || i.quantityReceived <= 0) {
          return new Response(JSON.stringify({ error: 'All items must have a name, type, and positive quantity received.' }), { status: 400, headers: corsHeaders });
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const lastOrder = await tx.order.findFirst({
          orderBy: { orderNumber: 'desc' },
        });
        const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;

        const order = await tx.order.create({
          data: {
            orderNumber: nextOrderNumber,
            orderTitle,
            dateReceived: new Date(dateReceived),
            overallCondition: overallCondition || 'Good',
            status: status || 'IN_STOCK',
            notes: notes || '',
            encodedBy: encodedBy || 'Guest Operator',
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

      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
    }

    // 8. Matches specific Order detail routes:
    // GET /api/orders/:id
    // PUT /api/orders/:id
    const orderMatch = path.match(/^\/api\/orders\/([^\/]+)$/);
    if (orderMatch) {
      const orderId = orderMatch[1];
      if (method === "GET") {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!order) {
          return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
        }

        const qtyReceived = order.items.reduce((sum, item) => sum + item.quantityReceived, 0);
        const qtyAvailable = order.items.reduce((sum, item) => sum + item.availableQuantity, 0);

        return new Response(
          JSON.stringify({
            ...order,
            qtyReceived,
            qtyAvailable,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (method === "PUT") {
        const body = await req.json();
        const { orderTitle, dateReceived, overallCondition, status, notes, encodedBy, items } = body;

        if (!orderTitle || !dateReceived || !items || !Array.isArray(items) || items.length === 0) {
          return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400, headers: corsHeaders });
        }

        const existingOrder = await prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!existingOrder) {
          return new Response(JSON.stringify({ error: 'Order not found.' }), { status: 404, headers: corsHeaders });
        }

        const updated = await prisma.$transaction(async (tx) => {
          const incomingItemIds = items.filter(i => i.id).map(i => i.id);
          const itemsToDelete = existingOrder.items.filter(ei => !incomingItemIds.includes(ei.id));

          for (const dItem of itemsToDelete) {
            await tx.orderItem.delete({ where: { id: dItem.id } });
          }

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
                  orderId,
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

          const updatedOrder = await tx.order.update({
            where: { id: orderId },
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

          await syncOrderAndItemStatuses(orderId, tx);

          const finalOrder = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true },
          });

          await tx.auditLog.create({
            data: {
              actionType: 'UPDATE_ORDER',
              entityType: 'ORDER',
              entityId: orderId,
              beforeData: JSON.stringify(existingOrder),
              afterData: JSON.stringify(finalOrder),
              notes: `Updated order #${existingOrder.orderNumber} by ${encodedBy || 'Guest Operator'}`,
            },
          });

          return finalOrder;
        });

        return new Response(JSON.stringify(updated), { status: 200, headers: corsHeaders });
      }
    }

    // 9. GET /api/orders/:id/usage
    const orderUsageMatch = path.match(/^\/api\/orders\/([^\/]+)\/usage$/);
    if (orderUsageMatch && method === "GET") {
      const orderId = orderUsageMatch[1];
      const txs = await prisma.usageTransaction.findMany({
        where: {
          items: {
            some: {
              orderItem: {
                orderId,
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
      return new Response(JSON.stringify(txs), { status: 200, headers: corsHeaders });
    }

    // 10. GET /api/usage or GET /api/usages
    if ((path === "/api/usage" || path === "/api/usages") && method === "GET") {
      const orderId = url.searchParams.get("orderId");
      let whereClause: any = {};

      if (orderId) {
        whereClause = {
          items: {
            some: {
              orderItem: {
                orderId: orderId,
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

      return new Response(
        JSON.stringify({
          success: true,
          usageRecords: txs,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 11. POST /api/usage or POST /api/usages
    if ((path === "/api/usage" || path === "/api/usages") && method === "POST") {
      const body = await req.json();
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
      } = body;

      if (!usageDate || !usageType || !items || !Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing required usage fields.' }), { status: 400, headers: corsHeaders });
      }

      const validatedItems = items.filter((i: any) => i.quantity > 0);
      if (validatedItems.length === 0) {
        return new Response(JSON.stringify({ error: 'At least one item with quantity greater than zero is required.' }), { status: 400, headers: corsHeaders });
      }

      const result = await prisma.$transaction(async (tx) => {
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
            encodedBy: encodedBy || 'Guest Operator',
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

        const affectedOrderIds = new Set<string>();
        for (const i of transaction.items) {
          affectedOrderIds.add(i.orderItem.orderId);
        }

        for (const orderId of affectedOrderIds) {
          await syncOrderAndItemStatuses(orderId, tx);
        }

        await tx.auditLog.create({
          data: {
            actionType: 'CREATE_USAGE',
            entityType: 'USAGE_TRANSACTION',
            entityId: transaction.id,
            beforeData: JSON.stringify({}),
            afterData: JSON.stringify(transaction),
            notes: `Recorded stock usage (${usageType}) by ${encodedBy || 'Guest Operator'}`,
          },
        });

        return transaction;
      });

      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
    }

    // 12. GET /api/usages/:id or GET /api/usage/:id, PUT /api/usages/:id or PUT /api/usage/:id
    const usageMatch = path.match(/^\/api\/usages?\/([^\/]+)$/);
    if (usageMatch) {
      const usageId = usageMatch[1];
      if (method === "GET") {
        const tx = await prisma.usageTransaction.findUnique({
          where: { id: usageId },
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
          return new Response(JSON.stringify({ error: 'Usage transaction not found' }), { status: 404, headers: corsHeaders });
        }
        return new Response(JSON.stringify(tx), { status: 200, headers: corsHeaders });
      }

      if (method === "PUT") {
        const body = await req.json();
        const { notes, status } = body;

        const existing = await prisma.usageTransaction.findUnique({
          where: { id: usageId },
          include: { items: { include: { orderItem: true } } },
        });

        if (!existing) {
          return new Response(JSON.stringify({ error: 'Usage record not found.' }), { status: 404, headers: corsHeaders });
        }

        const updated = await prisma.$transaction(async (tx) => {
          const nextStatus = status !== undefined ? status : existing.status;

          const updatedTx = await tx.usageTransaction.update({
            where: { id: usageId },
            data: {
              notes: notes !== undefined ? notes : existing.notes,
              status: nextStatus,
            },
            include: { items: { include: { orderItem: true } } },
          });

          const affectedOrderIds = new Set<string>();
          for (const i of existing.items) {
            affectedOrderIds.add(i.orderItem.orderId);
          }

          for (const orderId of affectedOrderIds) {
            await syncOrderAndItemStatuses(orderId, tx);
          }

          const finalTx = await tx.usageTransaction.findUnique({
            where: { id: usageId },
            include: { items: { include: { orderItem: true } } },
          });

          await tx.auditLog.create({
            data: {
              actionType: nextStatus === 'VOIDED' ? 'VOID_USAGE' : 'UPDATE_USAGE',
              entityType: 'USAGE_TRANSACTION',
              entityId: usageId,
              beforeData: JSON.stringify(existing),
              afterData: JSON.stringify(finalTx),
              notes: nextStatus === 'VOIDED' ? `Voided usage transaction by guest` : `Updated usage transaction by guest`,
            },
          });

          return finalTx;
        });

        return new Response(JSON.stringify(updated), { status: 200, headers: corsHeaders });
      }
    }

    // 13. POST /api/usages/:id/void
    const voidMatch = path.match(/^\/api\/usages?\/([^\/]+)\/void$/);
    if (voidMatch && method === "POST") {
      const usageId = voidMatch[1];
      const existing = await prisma.usageTransaction.findUnique({
        where: { id: usageId },
        include: { items: { include: { orderItem: true } } },
      });

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Usage record not found.' }), { status: 404, headers: corsHeaders });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const finalTx = await tx.usageTransaction.update({
          where: { id: usageId },
          data: { status: 'VOIDED' },
          include: { items: { include: { orderItem: true } } },
        });

        const affectedOrderIds = new Set<string>();
        for (const i of existing.items) {
          affectedOrderIds.add(i.orderItem.orderId);
        }

        for (const orderId of affectedOrderIds) {
          await syncOrderAndItemStatuses(orderId, tx);
        }

        await tx.auditLog.create({
          data: {
            actionType: 'VOID_USAGE',
            entityType: 'USAGE_TRANSACTION',
            entityId: usageId,
            beforeData: JSON.stringify(existing),
            afterData: JSON.stringify(finalTx),
            notes: `Voided usage transaction by guest`,
          },
        });

        return finalTx;
      });

      return new Response(JSON.stringify(updated), { status: 200, headers: corsHeaders });
    }

    // 14. GET /api/audit-logs
    if (path === "/api/audit-logs" && method === "GET") {
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
      });
      return new Response(JSON.stringify(logs), { status: 200, headers: corsHeaders });
    }

    // 15. GET /api/auth/me
    if (path === "/api/auth/me" && method === "GET") {
      return new Response(
        JSON.stringify({
          user: {
            id: 'guest-id-123',
            fullName: 'Guest Operator',
            email: 'guest@tracker.com',
            role: 'ADMIN',
          },
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 16. POST /api/auth/login
    if (path === "/api/auth/login" && method === "POST") {
      return new Response(
        JSON.stringify({
          user: {
            id: 'guest-id-123',
            fullName: 'Guest Operator',
            email: 'guest@tracker.com',
            role: 'ADMIN',
          },
          token: 'mock-jwt-token-xyz',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Route genuinely not found
    return new Response(
      JSON.stringify({ error: "Route not found" }),
      { status: 404, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("Netlify function server-side error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "An internal server error occurred.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/*",
};
