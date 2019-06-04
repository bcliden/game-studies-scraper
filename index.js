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
  const scrapedNewIssues = await Promise.all(newIssues.map(scrapeIssueForArticles));

  // stich responses together. they are in sequence
  const articleAggregate = scrapedNewIssues.reduce((acc, next) => {
    return [...acc, ...next]
  },[]);

  const articleURLs = articleAggregate.map(article => article.url);
  const citationAggregate = await Promise.all(articleURLs.map(scrapeArticleForCitations));

  const totalAggregate = articleAggregate.map((el, i) => {
    // console.log(el);
    const citations = [...citationAggregate[i]];
    return {...el, citations};
  });

  const firstIss = newIssues[0].split('/')[3];
  const lastIss = newIssues[newIssues.length-1].split('/')[3];
  const date = new Date().toDateString().split(' ').splice(1).join('-');

  // write into JSON as well
  fs.writeFileSync(`./gamestudies-${firstIss}-${lastIss}-${date}-with-citations.json`, JSON.stringify(totalAggregate, null, " "));

  // parse array into CSV and write it out
  // let finished = Papa.unparse(aggregate);
  let finished = Papa.unparse(totalAggregate);
  let finishedNoCitations = Papa.unparse(articleAggregate);

  fs.writeFileSync(`./gamestudies-${firstIss}-${lastIss}-${date}-no-citations.csv`, finishedNoCitations);
  fs.writeFileSync(`./gamestudies-${firstIss}-${lastIss}-${date}-with-citations.csv`, finished);
  console.log('All done! Please see the new json and csv(s) in the project folder.');
  console.timeEnd('time elapsed');
})();

function scrapeIssueForArticles(url) {
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

function scrapeArticleForCitations(url) {
  return new Promise(async function(resolve, reject){
    console.log('Scraping article %s', url);
    if (url === 'http://gamestudies.org/1601/articles/vmkar') {
      return resolve(await vmkarSpecialCase(url));
    };

    const page = await axios.get(url).catch(err => {
      console.error(err);
      return rej(err);
    });
    const $ = cheerio.load(page.data);

    // check for <h3> headers
    let blocks = $('#main')
      .find('h3')
      .filter(function(i, el){
        const header = $(this).text().toLowerCase().trim();
        return isBiblio(header);
      })
      .nextUntil('h3');

    // check for <p> headers
    if (blocks.length === 0){
      blocks = $('#main')
        .find('p')
        .filter(function(i, el){
          const header = $(this).text().toLowerCase().trim();
          return isBiblio(header);
        })
        .nextUntil('h3');      
    }

    // check for <h4> headers
    if (blocks.length === 0){
      blocks = $('#main')
      .find('h4')
      .filter(function(i, el){
        const header = $(this).text().toLowerCase().trim();
        return isBiblio(header);
      })
      .nextUntil('h4');
    }
    
    // check for <b> headers
    if (blocks.length === 0){
      blocks = $('#main')
      .find('b')
      .filter(function(i, el){
        const header = $(this).text().toLowerCase().trim();
        return isBiblio(header);
      })
      .nextUntil('b');
    }

    // check for <h2> headers
    if (blocks.length === 0){
      blocks = $('#main')
      .find('h2')
      .filter(function(i, el){
        const header = $(this).text().toLowerCase().trim();
        return isBiblio(header);
      })
      .nextUntil('h2');
    }

    let citations = [];

    blocks.filter(function(i, el){
        return $(this).text().trim().length > 0;
      })
      .each(function(i, el){
        citations[i] = $(this).text().trim()
          .replace(/[\n\r]/g, ' ') // convert an \n or \r to a space
          .replace(/[\t]/g, ''); // remove any \t
      });

    return resolve(citations);
  });
}

function isBiblio(str){
  // I should really just use a RexEx for this
  return str == 'bibliography' 
    || str == 'biblography:'
    || str == 'bibliography.'
    || str == 'reference'
    || str == 'references' 
    || str == 'references:'
    || str == 'works cited' 
    || str == 'works cited:'
    || str == 'bibliography and ludography'
}

async function vmkarSpecialCase(url){
  console.log("ugh");
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  let endSection = $('#end')
    .contents()
    .filter(function(i, el){
      return el.type == 'text';
    })
    .map(function(i, el){
      // console.log($(this).text());
      return el.data.trim();
    })
    .filter(function(i, el){
      return el.length > 0;
    });

  endSection = Array.from(endSection);
  let index = endSection.findIndex(el => isBiblio(el.toLowerCase()));
  let refs = endSection.slice(index + 1);

  // this specific article has """difficult""" formatting
  refs = [...refs.slice(0, 3), ...refs.slice(5), "Flanagan, M. (2009) Critical play. MIT Press."];

  return refs;
}