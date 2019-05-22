const cheerio = require('cheerio');
const axios = require('axios');
const Papa = require('papaparse');
const fs = require('fs');


(async () => {
  console.time('time elapsed');
  console.log('Proceeding to scrape the Game Studies website.');

  const {data: body} = await axios.get('http://gamestudies.org/0601/archive');
  let issues = cheerio.load(body)('#issuelist a');
  issues = Array.from(issues)
    .map(el => el.attribs.href) // grab url of link
    .map(url => { // remove trailing slash (if exists)
      if ( url[url.length - 1] == '/' ) {
        return url.substring(0, url.length -1);
      } else {
        return url;
      }
    });
    
  // vols 1-5 have a table layout I haven't figured out how to scrape yet
  const newIssues = issues.filter(url => url.split('/')[3].slice(0, 2) >= 6); 

  // scrape all the issues
  const scrapedNewIssues = await Promise.all(newIssues.map(scrapeIssue));

  // stich responses together. they are in sequence
  const aggregate = scrapedNewIssues.reduce((acc, next) => {
    return [...acc, ...next]
  },[]);

  const articleURLs = aggregate.map(article => article.url);
  const citationPopulatedAggregate = await Promise.all(articleURLs.map(scrapeCitations));
  // parse array into CSV and write it out
  // let finished = Papa.unparse(aggregate);
  let finished = Papa.unparse(citationPopulatedAggregate);

  const firstIss = newIssues[0].split('/')[3];
  const lastIss = newIssues[newIssues.length-1].split('/')[3];
  const date = new Date().toDateString().split(' ').splice(1).join('-');

  fs.writeFileSync(`./gamestudies${firstIss}-${lastIss}-${date}.csv`, finished);
  console.log('All done! Please see the new csv in the project folder.');
  console.timeEnd('time elapsed');
})();

function scrapeIssue(url) {
  return new Promise(async function(res, rej) {
    console.log('Scraping issue %s...', url);

    const page = await axios.get(url).catch(err => {
      console.error(err);
      return rej(err);
    });
    const $ = cheerio.load(page.data);
    
    const blocks = $('#main').find('div');
    let articles = [];

    // build article titles
    blocks.find('.summary')
      .each(function(i, el){ 
        articles[i] = {};
        articles[i].title = $(this).text(); // title
        articles[i].url = $(this).attr('href'); // url
      });
    
    // build author names
    blocks.find('small')
      .each(function (i, el) {
        articles[i].author = $(this).text().split(' ').splice(1).join(' ').trim();
      });

    // grab article hyperlinks
    // blocks.find('.summary')
    //   .each(function(i, el){

    //   });

    // grab metadata for page
    let volume = $('.volume').text().split(' ')[1];
    let issueno = $('.issueno').text().split(' ')[1];
    let date = $('.date').text();

    articles = articles.map(article => {
      return { ...article, volume, issue: issueno, date };
    });

    return res(articles);
  });
}

function scrapeCitations(url) {
  return new Promise(async function(resolve, reject){
    console.log('Scraping article %s', url);

    const page = await axios.get(url).catch(err => {
      console.error(err);
      return rej(err);
    });
    const $ = cheerio.load(page.data);

    const blocks = $('#main')
      .find('h3')
      .filter(function(i, el){
        return $(this).val() == 'References';
      })
      // .nextUntil('h3') 
    // see .next, .nextUntil
    let citations = [];

    blocks.each(function(i, el){
      citations[i] = $(this).text();
    });



    // build article titles
    // blocks.find('.summary')
    //   .each(function(i, el){ 
    //     citations[i] = {};
    //     citations[i].title = $(this).text(); // title
    //     citations[i].url = $(this).attr('href'); // url
    //   });

    blocks.find()

    return resolve(citations);
  });
}