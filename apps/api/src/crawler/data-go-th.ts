const resource_id = 'e4eaa1b4-eb1a-4534-b227-988ee25b898d';

const api_url = 'https://data.go.th/api/3/action/datastore_search';

export async function search_procurement(keyword: string, limit = 10) {
  const params = new URLSearchParams({
    resource_id,
    limit: String(limit),
    q: keyword,
    filters: JSON.stringify({
      จังหวัด: 'กรุงเทพมหานคร',
    }),
  });

  const response = await fetch(`${api_url}?${params}`);

  if (!response.ok) {
    throw new Error(`data.go.th API error: ${response.status}`);
  }

  const data = await response.json();

  return data.result.records;
}
