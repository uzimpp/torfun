import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 p-16 dark:bg-black">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Badge variant="outline" className="mb-2 w-fit">
            งานสร้างโครงระบบ
          </Badge>
          <CardTitle className="text-2xl">ระบบค้นหาประกาศ TOR</CardTitle>
          <CardDescription>
            รวบรวมและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ในกรุงเทพมหานคร
            เพื่อลดเวลาการค้นหาและคัดกรองด้วยมือ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>แดชบอร์ด (เร็ว ๆ นี้)</Button>
        </CardContent>
      </Card>
    </div>
  );
}
