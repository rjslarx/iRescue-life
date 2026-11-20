// Database allocation makes references unique across concurrent checkouts.
// References are labels, never authentication or public lookup credentials.
export const fundraiserOrderNumbersSql = `
CREATE SEQUENCE IF NOT EXISTS fundraiser_order_number_seq START WITH 1001;
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS order_number integer;
ALTER TABLE fundraiser_orders ALTER COLUMN order_number SET DEFAULT nextval('fundraiser_order_number_seq');
UPDATE fundraiser_orders SET order_number = nextval('fundraiser_order_number_seq') WHERE order_number IS NULL;
ALTER TABLE fundraiser_orders ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fundraiser_orders_order_number_unique ON fundraiser_orders(order_number);
`;
