import { createSimStore } from '@sim/core'
import { seedCustomers, type Customer } from './seed'

/** Store simulasi Sales Force; data disimpan di IndexedDB `sim-sales-force`. */
export const useCustomerStore = createSimStore<Customer>('sales-force', seedCustomers)
