const rxjs = require('rxjs');
const rp = require('request-promise');
const cheerio = require('cheerio');
const s = require('string');
const _ = require('lodash');
const fs = require('fs');

function get(url) {
  return rxjs.Observable.fromPromise(rp({
    uri: url,
    resolveWithFullResponse: false
  }));
}

rxjs.Observable.bindNodeCallback(fs.readFile)('./items.json', 'utf-8')
    .catch(t => rxjs.Observable.bindNodeCallback(fs.writeFile)('./items.json', '{}').mapTo('{}'))
    .map(JSON.parse)
    .flatMap(cache => get('https://gogoanime.se/anime-list.html')
        .map(cheerio.load)
        .flatMap(a => a('div.main_body > div.anime_list_body > ul.listing > li > a'))
        .pluck('attribs', 'href')
        .flatMap(p => rxjs.Observable.if(() => cache[p], rxjs.Observable.of({[p]: cache[p]}),
                rxjs.Observable.of(p)
                .map(a => `http://www3.gogoanime.tv${a}`)
                .flatMap(get)
                .retry()
                .map(cheerio.load)
                .flatMap(t => rxjs.Observable.of(t)
                    .filter(v => v('input#movie_id').length > 0)
                    .filter(v => v('input#movie_id')[0].attribs)
                    .filter(v => v('input#movie_id')[0].attribs.value)
                    .filter(v => v('ul#episode_page > li > a').length > 0)
                    .filter(v => v('ul#episode_page > li > a')[0].attribs)
                    .filter(v => v('ul#episode_page > li > a')[0].attribs.ep_start)
                    .filter(v => v('ul#episode_page > li > a')[0].attribs.ep_end)
                    .map(v => ({
                      id: t('input#movie_id')[0].attribs.value,
                      start: t('ul#episode_page > li > a')[0].attribs.ep_start,
                      end: t('ul#episode_page > li > a')[0].attribs.ep_end
                    }))
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
                    .map(a => ({[p]: a}))
                )
            )
        )
        .scan((a, b) => Object.assign(a, b), {})
    )
    .do(a => fs.writeFileSync('./items.json', JSON.stringify(a, null, 4), {encoding: 'utf-8'}))
    .subscribe(
        console.log,
        console.error,
        () => console.log('done')
    );
