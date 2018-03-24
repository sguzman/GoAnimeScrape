const rxjs = require('rxjs');
const rp = require('request-promise');
const cheerio = require('cheerio');
const s = require('string');

function get(url) {
  return rxjs.Observable.fromPromise(rp({
    uri: url,
    resolveWithFullResponse: false
  }));
}

rxjs.Observable.of(
    'http://www3.gogoanime.tv/category/a-channel',
    )
    .flatMap(get)
    .map(cheerio.load)
    .flatMap(t => rxjs.Observable.of({
            id: t('input#movie_id')[0].attribs.value,
            start: t('ul#episode_page > li > a')[0].attribs.ep_start,
            end: t('ul#episode_page > li > a')[0].attribs.ep_end
          })
        .map(t => `http://www3.gogoanime.tv/load-list-episode?ep_start=${t.start}&ep_end=${t.end}&id=${t.id}&default_ep=0`)
        .flatMap(get)
        .map(cheerio.load)
        .flatMap(t => t('#episode_related > li > a'))
        .map(t => ({
          href: t.attribs.href,
          ep: parseInt(s(cheerio.load(t)('div.name').text()).chompLeft(' EP ').s) - 1
        }))
        .reduce((a,b) => Array.prototype.concat(a, [b]), [])
        .map(u => ({
          title: t('div.anime_info_body_bg > h1').text(),
          eps: u.reduce((a, b) =>  {
            a[b.ep] = s(b.href).trim().s;
            return a;
          }, [])
        }))
        .flatMap(v => rxjs.Observable.from(v.eps)
            .map(a => `http://www3.gogoanime.tv${a}`)
            .flatMap(get)
            .retry()
            .map(cheerio.load)
            .flatMap(a => a('div.download-anime > a'))
            .pluck('attribs', 'href')
            .flatMap(get)
            .map(cheerio.load)
            .map(a => a('div.dowload > a'))
            .pluck('0', 'attribs', 'href')
        )
    )
    .subscribe(
        console.log,
        console.error,
        () => console.log('done')
    );
