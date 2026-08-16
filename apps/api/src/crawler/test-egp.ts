import { crawlPage } from './crawler';
import { extractProcurement } from './procurement';

const url =
  'https://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?proc_id=ShowHTMLFile&processFlows=Procure&projectId=69039205018&seqNo=1&servlet=gojsp&temp_Announ=A&temp_itemNo=0&templateType=W2';

const result = await crawlPage(url);

console.log({
  url: result.url,
  status: result.status,
  content_type: result.content_type,
  html_length: result.html_length,
  title: result.title,
  headings: result.headings,
  links: result.links,
});

console.log('\nPAGE TEXT:\n');
console.log(result.text);

const procurement = extractProcurement(result.text);

console.log('\nPROCUREMENT DATA:\n');
console.log(JSON.stringify(procurement, null, 2));
