export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'ADMIN' | 'ENCODER';
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNumber: number;
  orderTitle: string;
  dateReceived: string;
  overallCondition: string;
  status: string;
  notes?: string;
  encodedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemName: string;
  category?: string;
  itemType: 'CONSUMABLE' | 'REUSABLE';
  quantityReceived: number;
  quantityUsed?: number;
  quantityDeployed?: number;
  quantityReturned?: number;
  availableQuantity?: number;
  currentStatus?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;

  // UI / Compat helpers
  unit?: string;
  minimumStock?: number;
  condition?: string;
  storageLocation?: string;
  unitCost?: number;
  isReusable?: boolean;
  qtyUsed?: number;
  qtyDeployed?: number;
  qtyAvailable?: number;
  liveStatus?: string;
}

export interface UsageTransaction {
  id: string;
  usageDate: string;
  usageType: 'EVENT' | 'OFFICE' | 'EMPLOYEE_REPLACEMENT';
  eventName?: string;
  venue?: string;
  officeUseDetails?: string;
  employeeName?: string;
  employeeDepartment?: string;
  reason?: string;
  encodedBy: string;
  notes?: string;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
  updatedAt?: string;

  items?: UsageTransactionItem[];
}

export interface UsageTransactionItem {
  id: string;
  usageTransactionId: string;
  orderItemId: string;
  quantity: number;
  itemNotes?: string;
  createdAt?: string;

  // Relations
  orderItem?: OrderItem;
}

export interface AuditLog {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeData: string;
  afterData: string;
  notes?: string;
  timestamp: string;
}
