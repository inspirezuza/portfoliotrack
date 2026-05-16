import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { formatQuantity } from "@/lib/format";
import {
  listSelectableTransactionInstrumentOptions,
  listTransactionInstrumentOptions,
  listTransactions
} from "@/server/transactions";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, allInstruments, instruments] = await Promise.all([
    listTransactions({ order: "desc" }),
    listTransactionInstrumentOptions({ activeOnly: false }),
    listSelectableTransactionInstrumentOptions()
  ]);

  const transactionCount = transactions.length;
  const uniqueInstrumentCount = new Set(transactions.map((transaction) => transaction.instrumentId))
    .size;
  const latestTradeDate = transactions[0]?.tradeDate ?? "ยังไม่มีรายการ";
  const openInstrumentCount = allInstruments.filter(
    (instrument) => instrument.currentQuantity > 0
  ).length;
  const setupStatus =
    transactionCount === 0
      ? "ยังไม่มีรายการซื้อขาย บันทึกรายการซื้อแรกเพื่อเปิดใช้หน้าถือครอง มูลค่าพอร์ต และต้นทุนระดับสินทรัพย์"
      : instruments.length === 0
        ? "ยังไม่มีสินทรัพย์ที่พร้อมบันทึกรายการใหม่ เพิ่มสินทรัพย์หรือให้มีจำนวนคงเหลือก่อนบันทึกรายการถัดไป"
        : `มี ${instruments.length} สินทรัพย์พร้อมให้บันทึกรายการได้ทันที`;

  return (
    <section className="transactions-page">
      <article className="hero-card transactions-hero">
        <div className="hero-copy">
          <p className="eyebrow">รายการซื้อขาย</p>
          <h1>บันทึกซื้อขายให้เร็ว และให้ ledger ตรงเสมอ</h1>
          <p>
            เลือกสินทรัพย์จริง ระบุซื้อหรือขาย จำนวน ราคา และค่าธรรมเนียม
            ระบบจะกันรายการขายที่เกินจำนวนคงเหลือก่อนบันทึก
          </p>
          <span className="feature-accent">บันทึกเอง ตรวจสอบก่อนบันทึก รีเฟรชทันที</span>
        </div>

        <div className="hero-stats">
          <article className="metric-card">
            <p className="metric-value">{transactionCount}</p>
            <p className="metric-label">รายการที่บันทึก</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{uniqueInstrumentCount}</p>
            <p className="metric-label">สินทรัพย์ที่เคยซื้อขาย</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{openInstrumentCount}</p>
            <p className="metric-label">สถานะเปิดจากรายการ</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{latestTradeDate}</p>
            <p className="metric-label">วันที่ซื้อขายล่าสุด</p>
          </article>
        </div>
      </article>

      <article className="status-banner status-banner-neutral">
        <div>
          <p className="status-banner-title">ความพร้อมในการบันทึก</p>
          <p className="status-banner-copy">{setupStatus}</p>
        </div>
      </article>

      <div className="transactions-layout">
        <TransactionForm instruments={instruments} />
        <aside className="feature-stack">
          <article className="feature-card">
            <p className="eyebrow">รายละเอียดตัวเลือก</p>
            <h3>สัญลักษณ์มีบริบทครบ</h3>
            <p>
              ฟอร์มแสดง label ของสินทรัพย์แทน ID ดิบ พร้อมตลาดและสกุลเงิน
              เพื่อให้บันทึกเองได้เร็วแม้รายการสินทรัพย์เพิ่มขึ้น
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">กติกาการขาย</p>
            <h3>ถือครองติดลบไม่ได้</h3>
            <p>
              จำนวนคงเหลือคำนวณจากรายการที่บันทึกไว้ ถ้าขายเกินจำนวนที่มี
              server จะปฏิเสธก่อนเปลี่ยน ledger
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">สินทรัพย์ที่ใช้ได้</p>
            <h3>เลือกได้ {instruments.length} รายการ</h3>
            <p>
              {allInstruments.length > 0
                ? `จำนวนคงเหลือตอนนี้: ${allInstruments
                    .map((instrument) => `${instrument.symbol} ${formatQuantity(instrument.currentQuantity)}`)
                    .join(" - ")}`
                : "ยังไม่มีสินทรัพย์สำหรับบันทึกรายการ เพิ่มข้อมูลสินทรัพย์ก่อนเริ่มซื้อขาย"}
            </p>
          </article>
        </aside>
      </div>

      <TransactionTable transactions={transactions} />
    </section>
  );
}
