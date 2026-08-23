import { SearchPage } from '@/features/tors/pages/search-page';
import { mockTorRepository } from '@/features/tors/mock-tor-repository';
export default async function Page() {
  const { items } = await mockTorRepository.search();
  return <SearchPage tors={items} />;
}
