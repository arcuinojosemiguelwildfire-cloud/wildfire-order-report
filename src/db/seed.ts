import { prisma } from './client.ts';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('Database already seeded. Skipping.');
      return;
    }

    console.log('Seeding initial database tables...');

    // 1. Create Users
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const encoderPasswordHash = await bcrypt.hash('encoder123', 10);

    const admin = await prisma.user.create({
      data: {
        fullName: 'Admin User',
        email: 'admin@tracker.com',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        isActive: true,
      }
    });

    const encoder = await prisma.user.create({
      data: {
        fullName: 'Inventory Encoder',
        email: 'encoder@tracker.com',
        passwordHash: encoderPasswordHash,
        role: 'ENCODER',
        isActive: true,
      }
    });

    console.log('Seeded users:', { admin: admin.email, encoder: encoder.email });

    // 2. Create Suppliers
    const supplier1 = await prisma.supplier.create({
      data: {
        supplierName: 'Apex Event Logistics',
        contactPerson: 'Alex Rivera',
        contactNumber: '+63 917 123 4567',
        notes: 'Primary supplier for event materials and heavy equipment rental.',
      }
    });

    const supplier2 = await prisma.supplier.create({
      data: {
        supplierName: 'Del Monte Wholesale',
        contactPerson: 'Cynthia Gomez',
        contactNumber: '+63 920 987 6543',
        notes: 'Bulk food, beverages, and promotional material printer.',
      }
    });

    const supplier3 = await prisma.supplier.create({
      data: {
        supplierName: 'Office Depot Manila',
        contactPerson: 'Michael Tan',
        contactNumber: '+63 2 8888 1234',
        notes: 'Office stationery and daily consumables supplier.',
      }
    });

    // 3. Create Events
    const event1 = await prisma.event.create({
      data: {
        eventName: 'Del Monte Nascon Event Supplies',
        clientName: 'Del Monte Philippines',
        eventDate: new Date('2026-07-15T00:00:00Z'),
        venue: 'Manila Hotel Grand Ballroom',
        status: 'Active',
        notes: 'Annual National Sales Convention.',
      }
    });

    const event2 = await prisma.event.create({
      data: {
        eventName: 'Tech Summit Manila 2026',
        clientName: 'Google Cloud User Group',
        eventDate: new Date('2026-08-20T00:00:00Z'),
        venue: 'SMX Convention Center BGC',
        status: 'Active',
        notes: 'Annual developer and cloud summit.',
      }
    });

    // 4. Create Employees
    const employee1 = await prisma.employee.create({
      data: {
        fullName: 'Juan Dela Cruz',
        department: 'Logistics',
        contactNumber: '+63 915 555 1111',
        isActive: true,
        notes: 'Operations and logistics lead encoder.',
      }
    });

    const employee2 = await prisma.employee.create({
      data: {
        fullName: 'Maria Santos',
        department: 'Operations Support',
        contactNumber: '+63 916 555 2222',
        isActive: true,
        notes: 'Client facing event organizer.',
      }
    });

    // 5. Create Office Locations
    const office1 = await prisma.officeLocation.create({
      data: {
        locationName: 'Makati Headquarters - Room 402',
        department: 'Administration',
        description: 'Main admin office where office supplies are stored.',
      }
    });

    const office2 = await prisma.officeLocation.create({
      data: {
        locationName: 'Pasig Warehouse Shelf B',
        department: 'Logistics',
        description: 'Main inventory storage for reusable event hardware.',
      }
    });

    console.log('Seeding initial orders and items...');

    // 6. Create Initial Orders
    const order1 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-2026-001',
        orderTitle: 'Del Monte Nascon Supplies Batch',
        supplierId: supplier2.id,
        poOrInvoiceNumber: 'PO-991823',
        dateOrdered: new Date('2026-06-20T00:00:00Z'),
        dateReceived: new Date('2026-06-25T00:00:00Z'),
        overallCondition: 'Good',
        status: 'Available',
        notes: 'All items received in excellent condition.',
        createdBy: admin.id,
        items: {
          create: [
            {
              itemName: 'Extension Cord',
              category: 'Equipment',
              unit: 'Piece',
              itemType: 'REUSABLE',
              quantityReceived: 10,
              minimumStock: 2,
              condition: 'New',
              storageLocation: 'Pasig Warehouse Shelf B',
              unitCost: 450.00,
              notes: 'Heavy duty, 10 meters.'
            },
            {
              itemName: 'Gaffer Tape',
              category: 'Event Materials',
              unit: 'Roll',
              itemType: 'CONSUMABLE',
              quantityReceived: 20,
              minimumStock: 5,
              condition: 'New',
              storageLocation: 'Pasig Warehouse Shelf B',
              unitCost: 180.00,
              notes: 'Black, non-reflective.'
            },
            {
              itemName: 'ID Lace',
              category: 'Event Materials',
              unit: 'Piece',
              itemType: 'CONSUMABLE',
              quantityReceived: 50,
              minimumStock: 10,
              condition: 'New',
              storageLocation: 'Makati Headquarters - Room 402',
              unitCost: 25.00,
              notes: 'Del Monte branding.'
            }
          ]
        }
      }
    });

    console.log('Database seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}
