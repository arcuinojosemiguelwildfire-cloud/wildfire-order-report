export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'ADMIN' | 'ENCODER';
  isActive: boolean;
}

export interface Supplier {
  id: string;
  supplierName: string;
  contactPerson: string;
  contactNumber: string;
  notes?: string;
  createdAt?: string;
}

export interface Event {
  id: string;
  eventName: string;
  clientName: string;
  eventDate: string;
  venue: string;
  status: string;
  notes?: string;
}

export interface Employee {
  id: string;
  fullName: string;
  department: string;
  contactNumber?: string;
  isActive: boolean;
  notes?: string;
}

export interface OfficeLocation {
  id: string;
  locationName: string;
  department: string;
  description?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderTitle: string;
  supplierId: string;
  supplierName?: string;
  poOrInvoiceNumber: string;
  dateOrdered: string;
  dateReceived: string;
  overallCondition: string;
  status: 'Available' | 'Partially Used' | 'Fully Used' | 'Closed';
  notes?: string;
  createdBy: string;
  createdAt?: string;
  supplier?: Supplier;
  creator?: User;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemName: string;
  category: string;
  unit: string;
  itemType: 'CONSUMABLE' | 'REUSABLE';
  quantityReceived: number;
  minimumStock: number;
  condition: string;
  storageLocation: string;
  unitCost?: number;
  notes?: string;
  
  // Client calculated balances
  qtyUsed?: number;
  qtyDeployed?: number;
  qtyReturned?: number;
  qtyDamaged?: number;
  qtyAvailable?: number;
  liveStatus?: string;
}

export interface UsageTransaction {
  id: string;
  usageReference: string;
  usageDate: string;
  usageType: 'EVENT' | 'OFFICE' | 'EMPLOYEE_REPLACEMENT' | 'DAMAGE_LOSS' | 'RETURN' | 'ADJUSTMENT';
  eventId?: string;
  employeeId?: string;
  officeLocationId?: string;
  reason?: string;
  notes?: string;
  status: 'ACTIVE' | 'VOIDED';
  voidReason?: string;
  createdBy: string;
  createdAt: string;
  
  event?: Event;
  employee?: Employee;
  officeLocation?: OfficeLocation;
  creator?: User;
  items?: UsageTransactionItem[];
}

export interface UsageTransactionItem {
  id: string;
  usageTransactionId: string;
  orderItemId: string;
  quantity: number;
  movementType: 'CONSUMED' | 'TEMPORARY_ISSUE' | 'RETURNED' | 'DAMAGED' | 'REPLACED' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  itemCondition: string;
  notes?: string;
  orderItem?: OrderItem;
}

export interface AuditLog {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  oldValues: string;
  newValues: string;
  remarks?: string;
  createdAt: string;
  user?: User;
}
