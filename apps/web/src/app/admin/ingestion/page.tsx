import type { Metadata } from "next";
import { IngestionDashboard } from "@/components/ingestion/ingestion-dashboard";

export const metadata: Metadata = {
  title: "สถานะการดึงข้อมูล TOR | TOR Finder",
  description: "หน้าสำหรับผู้ดูแลระบบ ติดตามสถานะการดึงประกาศ TOR จากระบบ e-GP",
};

export default function IngestionPage() {
  return <IngestionDashboard />;
}
