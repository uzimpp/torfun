const resource_id = 'e4eaa1b4-eb1a-4534-b227-988ee25b898d';

const url = new URL('https://data.go.th/api/3/action/datastore_search');

url.searchParams.set('resource_id', resource_id);
url.searchParams.set('limit', '5');

const response = await fetch(url);

console.log('status:', response.status);

const data = await response.json();

console.log(JSON.stringify(data, null, 2));
