const cheerio = require('cheerio');
const axios = require('axios');

let csv = [];

(async () => {
  const {data: body} = await axios.get('http://gamestudies.org/0601/archive');
  let issues = cheerio.load(body)('#issuelist a');

  // here lies list or archive urls
  // let issues = $('#issuelist a');
  issues = Array.from(issues)
    .map(el => el.attribs.href)
    .filter(el => el.split('/').length === 4);

  // iterate over issues
  for (let issue of issues) {
    let page = await axios.get(issue);
    let $ = cheerio.load(page.data);
    let sectionArray = [];

    let main = $('#main');
    if (main[0]) { // check if #main exists
      let blocks = main.find('div');
      // Array.from(titles).forEach(el => console.log(el.text()));
      console.log(issue);
      blocks.find('.summary')
        .each(function(i, el){ 
          sectionArray[i] = {};
          sectionArray[i].title = $(this).text();
        });
      
      blocks.find('small')
        .each(function (i, el) {
          sectionArray[i].author = $(this).text().split(' ').splice(1).join(' ').trim();
        });

      let volume = $('.volume').text().split(' ')[1];
      let issueno = $('.issueno').text().split(' ')[1];
      let date = $('.date').text();

      sectionArray = sectionArray.map(el => {
        return {...el, volume, issue: issueno, date };
      })

      csv = [...csv, ...sectionArray]
    } else {
      console.log(`issue ${issue} didn't have #main`)
    }
  }

  console.log(csv);
})();

