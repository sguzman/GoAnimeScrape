const rxjs = require('rxjs');
const rp = require('request-promise');
const cheerio = require('cheerio');
const s = require('string');
const _ = require('lodash');
const fs = require('fs');
const rh = require('@akanass/rx-http-request');

function get(url) {
  return rh.RxHR.get(url)
      .retry()
      .pluck('body')
      .map(cheerio.load)
}

const clean = rxjs.pipe(
    rxjs.operators.filter(v => v('input#movie_id').length > 0),
    rxjs.operators.filter(v => v('input#movie_id')[0].attribs),
    rxjs.operators.filter(v => v('input#movie_id')[0].attribs.value),
    rxjs.operators.filter(v => v('ul#episode_page > li > a').length > 0),
    rxjs.operators.filter(v => v('ul#episode_page > li > a')[0].attribs),
    rxjs.operators.filter(v => v('ul#episode_page > li > a')[0].attribs.ep_start),
    rxjs.operators.filter(v => v('ul#episode_page > li > a')[0].attribs.ep_end)
);

rxjs.Observable.bindNodeCallback(fs.readFile)('./items.json', 'utf-8')
    .catch(t => rxjs.Observable.bindNodeCallback(fs.writeFile)('./items.json', '{}').mapTo('{}'))
    .map(JSON.parse)
    .flatMap(cache => get('https://gogoanime.se/anime-list.html')
        .flatMap(a => a('div.main_body > div.anime_list_body > ul.listing > li > a'))
        .pluck('attribs', 'href')
        .flatMap(p => rxjs.Observable.if(() => cache[p], rxjs.Observable.of({[p]: cache[p]}),
                rxjs.Observable.of(p)
                .map(a => `http://www3.gogoanime.tv${a}`)
                .flatMap(get)
                .flatMap(t => rxjs.Observable.of(t)
                    .let(clean)
                    .map(v => ({
                      id: v('input#movie_id')[0].attribs.value,
                      start: v('ul#episode_page > li > a')[0].attribs.ep_start,
                      end: v('ul#episode_page > li > a')[0].attribs.ep_end
                    }))
                    .map(t => `http://www3.gogoanime.tv/load-list-episode?ep_start=${t.start}&ep_end=${t.end}&id=${t.id}&default_ep=0`)
                    .flatMap(get)
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
                                .map(c => c('div.download-anime > a[href]'))
                                .pluck('0', 'attribs', 'href')
                                .filter(c => c)
                                .flatMap(get)
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
