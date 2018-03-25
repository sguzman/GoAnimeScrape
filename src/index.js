const rxjs = require('rxjs');
const rp = require('request-promise');
const cheerio = require('cheerio');
const s = require('string');
const _ = require('lodash');

function get(url) {
  return rxjs.Observable.fromPromise(rp({
    uri: url,
    resolveWithFullResponse: false
  }));
}

rxjs.Observable.of(
    'http://www3.gogoanime.tv/category/a-channel',
    'https://gogoanime.se/category/one-punch-man'
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
        .retry()
        .map(cheerio.load)
        .flatMap(t => t('#episode_related > li > a'))
        .pluck('attribs', 'href')
        .map(a => s(a).trim().s)
        .reduce((a,b) => Array.prototype.concat(a, [b]), [])
        .map(a => _.reverse(a))
        .flatMap(a => rxjs.Observable.forkJoin(
            a
                .map(b => `http://www3.gogoanime.tv${b}`)
                .map(b =>
                    rxjs.Observable.of(b)
                        .flatMap(get)
                        .retry()
                        .map(cheerio.load)
                        .map(c => c('div.download-anime > a[href]'))
                        .pluck('0', 'attribs', 'href')
                        .flatMap(get)
                        .map(cheerio.load)
                        .map(c => c('div.dowload > a[href]'))
                        .pluck('0', 'attribs', 'href')
                )
        ))
        .map(a => ({
          title: t('.anime_info_body_bg > h1').text(),
          eps: a
        }))
    )
    .subscribe(
        console.log,
        console.error,
        () => console.log('done')
    );
