import { useState } from 'react'
import { Autocomplete } from '../../components/Autocomplete'
import { ChipSection } from '../../components/FilterParts'
import { searchOrganizationsByName, searchPeopleByName, type OrganizationHit, type PersonHit } from '../../lib/annict'
import { t, tx } from '../../lib/i18n'
import { findPerson } from '../../lib/shikimori'
import { messageOf } from '../../lib/useWriteQueue'
import { KNOWN_STUDIOS } from '../../lib/studios'
import { DISLIKE_GENRES, DISLIKE_TOPICS, studioTarget, topicOfGenre, type Dislikes } from './dislikes'
import { GENRE_JA, genreName } from './taste'

type GenreChoice = (typeof DISLIKE_GENRES)[number]

// ひらがなをカタカナに（「ほらー」でホラーに当てる）
const kana = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

// ジャンルを日本語名・英語名の一部で探す（画面の言語に関わらず）。名前の頭から当たるものを先に
function searchGenres(q: string): GenreChoice[] {
  const needle = kana(q.trim())
  const names = (g: GenreChoice) => [kana(GENRE_JA[g.name] ?? ''), kana(g.name)]
  return DISLIKE_GENRES.filter((g) => names(g).some((n) => n.includes(needle)))
    .sort((a, b) => Number(!names(a).some((n) => n.startsWith(needle))) - Number(!names(b).some((n) => n.startsWith(needle))))
    .slice(0, 8)
}

// マッチングの条件の「苦手な項目」。選んだ項目・制作会社・人物に当たる作品は、候補から外す。
// 項目には、外すと評判の高い作品がどれだけ一緒に外れるか（巻き添えの大きさ）を添える。変えても提案は作り直さない（次に提案するときに効く）
export function DislikeControls(props: { token: string; dislikes: Dislikes; onSet: (key: string, active: boolean, name?: string) => void }) {
  const { dislikes, onSet } = props
  const on = (key: string) => dislikes.get(key)?.active === true
  const selected = [...dislikes].filter(([, v]) => v.active).map(([k]) => k)
  const [busy, setBusy] = useState(false)
  const [personNote, setPersonNote] = useState<string | null>(null)

  const knownIds = new Set(KNOWN_STUDIOS.map((s) => `studio:${s.shikimoriId}`))
  const studioItems = [
    ...KNOWN_STUDIOS.map((s) => ({ id: `studio:${s.shikimoriId}`, label: tx(s) })),
    // 検索で足した会社（名の知れた会社の表に無いもの）
    ...selected.filter((k) => k.startsWith('studio:') && !knownIds.has(k)).map((k) => ({ id: k, label: dislikes.get(k)?.name ?? k })),
  ]
  const genres = DISLIKE_GENRES.filter((g) => on(g.key))
  const people = selected.filter((k) => k.startsWith('person:')).map((k) => ({ id: k, label: dislikes.get(k)?.name ?? k }))

  async function pickPerson(p: PersonHit) {
    setBusy(true)
    setPersonNote(null)
    try {
      // 参加作品は Shikimori から引くので、Shikimori の人物に結ぶ（作品の詳細の名前から参加作品を開くときと同じ照合）
      const hit = await findPerson(p.name)
      if (hit) onSet(`person:${hit.id}`, true, p.name)
      else setPersonNote(t(`${p.name}さんの参加作品が見つからず、除けませんでした。`, `Couldn’t find works by ${p.name}, so they can’t be avoided.`))
    } catch (e) {
      setPersonNote(t(`${p.name}さんを確かめられませんでした（${messageOf(e)}）。もう一度試してください。`, `Couldn’t check ${p.name} (${messageOf(e)}). Please try again.`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dislikes">
      <p className="note dislikes__lead">
        {t(
          '選んだ項目に当たる作品は、候補から外します。％は、評判の高い作品（Shikimoriで8点以上の人気のTVアニメ）のうち、一緒に外れる割合です。',
          'Anime that match what you pick are left out of suggestions. The % shows how many highly rated anime (popular TV anime scoring 8+ on Shikimori) would be left out with it.',
        )}
      </p>
      <ChipSection
        title={t('ジャンル・作品の長さ', 'Genres and length')}
        items={DISLIKE_TOPICS.map((d) => ({ id: `topic:${d.id}`, label: d.label, count: `${d.loss.toFixed(1)}%` }))}
        selected={selected}
        onToggle={(key) => onSet(key, !on(key))}
      />
      {/* 束ねた項目に無いジャンルは、1つずつ足す（Shikimori のジャンル・テーマ・対象層から） */}
      {genres.length > 0 && (
        <div className="filtersheet__chips dislikes__added">
          {genres.map((g) => (
            <button
              key={g.key}
              type="button"
              className="chip"
              aria-pressed
              title={t('押すと、除くのをやめます', 'Press to stop avoiding')}
              onClick={() => onSet(g.key, false)}
            >
              {genreName(g.name)}
              <span className="chip__count">{`${g.loss.toFixed(1)}%`}</span>
            </button>
          ))}
        </div>
      )}
      <Autocomplete<GenreChoice>
        label={t('ほかのジャンルを探して足す', 'Find and add another genre')}
        placeholder={t('ほかのジャンルを探して足す（例: 魔法少女・吸血鬼）', 'Find and add another genre (e.g. Mahou Shoujo, Vampire)')}
        wait={0}
        search={searchGenres}
        item={(g) => {
          const topic = topicOfGenre(g.name)
          const covered = topic && on(`topic:${topic.id}`)
          return {
            key: g.key,
            label: genreName(g.name),
            sub: covered
              ? t(`「${topic.label}」で除いています`, `Avoided under “${topic.label}”`)
              : on(g.key)
                ? t('除いています', 'Avoided')
                : t(`評判の高い作品の${g.loss.toFixed(1)}%`, `${g.loss.toFixed(1)}% of highly rated anime`),
            disabled: covered || on(g.key),
          }
        }}
        onPick={(g) => onSet(g.key, true)}
      />
      <ChipSection
        title={t('制作会社', 'Studios')}
        items={studioItems}
        selected={selected}
        onToggle={(key) => onSet(key, !on(key), studioItems.find((s) => s.id === key)?.label)}
        first={16}
        moreLabel={(rest) => t(`ほかの${rest}社も見る`, `Show ${rest} more`)}
      />
      <Autocomplete<OrganizationHit>
        label={t('制作会社を名前で探す', 'Search studios by name')}
        placeholder={t('制作会社を名前で探す', 'Search studios by name')}
        search={(q) => searchOrganizationsByName(props.token, q)}
        item={(o) => {
          const target = studioTarget(o)
          return {
            key: String(o.annictId),
            label: o.name,
            sub: !target
              ? t('候補の作品と結びつけられないため、選べません', 'Can’t be matched to suggested anime')
              : on(target.id)
                ? t('除いています', 'Avoided')
                : t(`${o.staffsCount}作品に参加`, `${o.staffsCount} anime`),
            disabled: !target || on(target.id),
          }
        }}
        onPick={(o) => {
          const target = studioTarget(o)
          if (target) onSet(target.id, true, o.name)
        }}
      />
      <section className="filtersheet__group">
        <h3 className="detail__label">{t('人物（声優・スタッフ）', 'People (cast and staff)')}</h3>
        {people.length > 0 && (
          <div className="filtersheet__chips">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed
                title={t('押すと、除くのをやめます', 'Press to stop avoiding')}
                onClick={() => onSet(p.id, false)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <Autocomplete<PersonHit>
          label={t('人物を名前で探す', 'Search people by name')}
          placeholder={t('人物を名前で探す（かなでも探せます）', 'Search people by name')}
          search={(q) => searchPeopleByName(props.token, q)}
          item={(p) => ({
            key: String(p.annictId),
            label: p.name,
            sub: [p.castsCount > 0 ? t(`出演 ${p.castsCount}`, `Cast ${p.castsCount}`) : '', p.staffsCount > 0 ? t(`スタッフ ${p.staffsCount}`, `Staff ${p.staffsCount}`) : '']
              .filter(Boolean)
              .join(t('・', ' · ')),
          })}
          onPick={(p) => void pickPerson(p)}
          busy={busy}
        />
        {personNote && <p className="note">{personNote}</p>}
        <p className="note dislikes__hint">
          {t('声の出演とスタッフとして参加した作品を、すべて外します。', 'Leaves out every anime they voiced or worked on as staff.')}
        </p>
      </section>
    </div>
  )
}
