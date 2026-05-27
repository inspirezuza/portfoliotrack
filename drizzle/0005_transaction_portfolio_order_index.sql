CREATE INDEX IF NOT EXISTS transactions_portfolio_execution_order_idx
  ON transactions (portfolio_id, trade_date, created_at, id);
