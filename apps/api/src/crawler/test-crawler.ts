// import { crawlPage } from './crawler';

// const startUrl = 'https://www.gprocurement.go.th/homepage.html';

// const homepage = await crawlPage(startUrl);

// console.log('Homepage:');
// console.log({
//   title: homepage.title,
//   links: homepage.links,
// });

// const websiteLink = homepage.links.find(
//   (link) => link.href === 'https://www.gprocurement.go.th/new_index.html',
// );

// if (!websiteLink) {
//   throw new Error('Could not find the e-GP website link');
// }

// const website = await crawlPage(websiteLink.href);

// console.log('\nNew Index:');
// console.log({
//   url: website.url,
//   status: website.status,
//   content_type: website.content_type,
//   html_length: website.html_length,
//   title: website.title,
//   headings: website.headings,
//   links: website.links,
// });
