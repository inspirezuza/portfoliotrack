import { HoldingsTable } from "@/components/holdings-table";
import { SummaryCards } from "@/components/summary-cards";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const { summary, holdingsSnapshot } = await getDashboardSnapshot();
  const holdingsStatus =
    holdingsSnapshot.openPositionCount === 0
      ? {
          title: "ยังไม่มีสถานะเปิด",
          body: "เมื่อบันทึกรายการซื้อ หน้านี้จะสรุปจำนวน ต้นทุน และสถานะราคาจาก ledger ให้ทันที"
        }
      : holdingsSnapshot.latestPriceAsOf == null
        ? {
            title: "ยังไม่มีราคาในแคช",
            body: "จำนวนและต้นทุนพร้อมใช้งานแล้ว ส่วนมูลค่าตลาดและ unrealized P&L จะเติมหลังรีเฟรชราคาสำเร็จครั้งแรก"
          }
        : holdingsSnapshot.isPriceDataStale
          ? {
              title: "ราคาในแคชเริ่มเก่า",
              body: `ตารางนี้ยังใช้แคชสำเร็จล่าสุดจาก ${holdingsSnapshot.latestPriceAsOf} หากต้องการ snapshot ใหม่ให้รีเฟรชจากแดชบอร์ด`
            }
          : {
              title: "ราคาครอบคลุมล่าสุด",
              body: `มีราคาในแคชสำหรับ ${holdingsSnapshot.pricedPositionCount} สถานะเปิด ณ ${holdingsSnapshot.latestPriceAsOf}`
            };

  return (
    <section className="dashboard-grid">
      <article className="hero-card holdings-hero">
        <div className="hero-copy">
          <p className="eyebrow">รายการถือครอง</p>
          <h1>สถานะเปิด ต้นทุน และราคาล่าสุดในหน้าเดียว</h1>
          <p>
            หน้านี้สรุปสถานะจากรายการซื้อขายจริง ราคาในแคชช่วยเติมมูลค่าตลาดเมื่อมีข้อมูล
            และแสดงให้เห็นชัดเมื่อราคายังไม่พร้อม
          </p>
          <span className="feature-accent">ยึด ledger เป็นหลัก แล้วเสริมด้วยราคา</span>
        </div>

        <div className="hero-stats">
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
            <p className="metric-label">สถานะเปิด</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
            <p className="metric-label">มีราคาในแคช</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
            <p className="metric-label">รอราคา</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.latestPriceAsOf ?? "ยังไม่มีแคช"}</p>
            <p className="metric-label">เวลาแคชล่าสุด</p>
          </article>
        </div>
      </article>

      <SummaryCards summary={summary} />

      <article className="status-banner status-banner-neutral">
        <div>
          <p className="status-banner-title">{holdingsStatus.title}</p>
          <p className="status-banner-copy">{holdingsStatus.body}</p>
        </div>
      </article>

      <HoldingsTable holdings={holdingsSnapshot.holdings} />
    </section>
  );
}
