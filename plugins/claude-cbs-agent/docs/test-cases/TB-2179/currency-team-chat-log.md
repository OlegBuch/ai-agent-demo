Status: Living document — appended as new chat messages arrive
Related Epic: TB-8 | EP-01.13 Currency Definition and Logic (covers all four `US-01.13.0x`
Stories, not just TB-2179 — keep this file at the module level, not tied to one Task/ticket)
Owner: Manual QA / AQA (raw source archive, see `analysis.md` for the synthesized reading)

# Currency Definition and Logic — Team Chat Log (raw archive)

This file is a **raw, chronological archive** of the team's own chat (Google Chat) about the
Currency Definition and Logic module — Manual QA (Mikalai Yudzilevich), AQA (Dmitry Kirzhanov),
Solution Architect (Andrei Sech), the client-side domain SME (Andrei Petkevich), and developers
(Dima Bogoslovsky, Ilona Fralova, Artur Fonichkin, Ilya Vatsevich). It exists **alongside**
`docs/test-cases/TB-2179/analysis.md`, not instead of it:

- **This file** — the actual message text, in order, so nothing said in chat is lost even if it
  never made it into a formal spec update. Append new pasted messages here.
- **`analysis.md`** — the synthesized reading: which Open Questions/Gaps this chat resolves, with
  a dated citation back into this file. Update `analysis.md`'s Open Questions/Gaps/Changelog
  whenever a new chat batch actually changes what's known — don't let it drift out of sync with
  this log.

Speaker note: "Андрей Петкевич" posts under a Google account tagged
`domain_disabledExternal user not managed by admin` in the original chat UI — that tag is stripped
below, he is the client-side domain SME. Reply-preview ("Quoted … End Quote") chrome from the chat
UI is also stripped; a quoted reply is rendered below as an indented `>` line instead.

---

## How to update this log

When the user pastes new messages from this chat:

1. Append them to the **end** of the chronological log below, in the order given, under a new
   `## <date>` heading if they start a new date not already present.
2. Keep the speaker name + original timestamp for every message — never summarize/compress a
   message's own text away, only strip UI chrome (quote-preview boilerplate, account tags).
3. After appending, re-check `analysis.md`'s Open Questions/Gaps/Required Test Types sections —
   if the new messages resolve, contradict, or add to any of them, update `analysis.md` with a
   dated citation back to this file (`currency-team-chat-log.md`, <date> entry) and a new
   Changelog line, the same way the 2026-08-14 v2 update did.
4. This file itself gets a short "Log updates" line added to `analysis.md`'s Changelog each time
   it grows — don't duplicate the resolved-question detail in both places, `analysis.md` should
   only ever hold the citation + synthesis, this file holds the source text.

---

## Original questions — Mikalai Yudzilevich → Andrei Petkevich (sent together, 2026-07-01)

1. Какой механизм получения обменных курсов из разных маркетов (гейтвеи для форекса и прочее?)
2. У нас есть общий механизм скедуленных джоб? Или пишем свой личный для Currency тейблов?
3. Нам нужна мануальная инвалидация рейтов (положим Казначейством) в середине между start_date и
   end_date в таблице currency.rates?
4. start_date и end_date в таблице currency.rates проставляется судя по спекам "Exact insertion
   timestamp", т.е. правильно что start_date = окончание работы зашедуленной джобы? (др.сл. джоба
   зашедулена запуститься в 9:00, закончила работу в 9:02 и в таблицу currency.rates летит
   start_date = dd.mm.yyyy 09:02 и end_date положим = dd.mm.yyyy 12:02)
5. Как и по каким правилам проставляется MID значение rate? Автоматом/казначейством. Если
   казначейством, то где на каком уровне мы контролируем доступ к этому (SMS?)
6. CB.SPREAD - The maximum allowed deviation from the official Central Bank rate -> мы в плагине
   валидируем отклонение от ЦБ, где хранится значение ЦБ (куда мы ходим за ним?)
7. Assumptions and Dependencies, bank's Local Currency is still defined centrally in the COMPANY
   (Lead Company) record -- это мы расширяем COMPANY Таблицу новым филдом? Может ли она быть Base
   currency или мы иногда должны это запрещать? Или всегда?
8. CURRENCY.RATES композитный ключ, как используется, по нему ищем? По части ключа ищем? (мне
   очень не нравится идея делать его primary key)
9. Какая максимальная длина ключа? У части ключа которая отвечает за Business Unit фиксированная
   длина? Или min max есть разбежка при валидации?
10. Define the immutable characteristics of every global currency (Numeric Code, Decimal
    Precision) -- Decimal Precision, деноминацию не учитываем? ))

---

## 2026-07-01

**Андрей Петкевич, 9:09 AM** (re: Q1):
Ввод/загрузка вручную или автоматически/по соответствующему интерфейсу курсов в CURRENCY.ORDER в
любой момент, в разрезе маркет/подразделение/валюты. Ручная/автоматическая авторизация. Далее
сервис ежеминутно обрабатывает все новые авторизованные CURRENCY.ORDER и при наступлении
START.TIME загружает курсы из них в CURRENCY.RATE

**Андрей Петкевич, 9:09 AM** (re: Q3):
Я бы делал. И делал бы всё через ввод нового CURRENCY.ORDER (не трогая вручную напрямую
CURRENCY.RATES)

**Андрей Петкевич, 9:12 AM** (re: Q4):
Лучше предусмотреть механизмы запуска/отработки сервисов/джобов ежеминутно, и проставлять точное
(указанное в currency.order) старт и енд-время в currency.rates. Если так нельзя - округлять к
ближайшему возможному/доступному

**Андрей Петкевич, 9:14 AM** (re: Q5):
Точно по таким же правилам, как и курсы BID/ASK. Может быть вручную либо автоматически/по
интерфейсу. SMS - по общим правилам, доступ и права к таблице CURRENCY.ORDER

**Андрей Петкевич, 9:19 AM** (re: Q6):
Я бы пока не вводил данное поле. Это я помечал Андрею в комментариях к ФС. У Андрея просто еще не
дошли руки обработать мои комменты и выдать проапдейченую версию спеки)) В будущем, если будут
подобные требования у клиента - введем подобное поле

**Андрей Петкевич, 9:27 AM** (re: Q8):
Все параметры композитного ключа дублируются в самой записи в отдельных полях. Это подойдет?

**Андрей Петкевич, 9:31 AM** (re: Q9):
Рынок - до 2 символов, валюты - всегда по 3 символа, подразделение - до 7 символов. Плюс
точки/разделители между ними. То есть длина - не фиксированная, с указанными мин/макс - по
отдельным компонентам ключа (все компоненты - обязательные)

**Андрей Петкевич, 9:40 AM** (re: Q10):
Decimal Precision = поле NO.OF.DECIMALS. При деноминации - будут просто заводиться новые курсы, уже
с учетом проведенной деноминации

**Андрей Петкевич** (re: Q2):
Моё мнение - для функционала валют нужен отдельный сервис/джоб. Но я не тех, вашим разработчикам -
виднее

**Dmitry Kirzhanov, 2:49 PM:**
@Dima Bogoslovsky

**Dmitry Kirzhanov, 2:49 PM** (re: Q2):
Мы по шедуленным джобам свою маленькую личную пишем тут?

*(re: Q7, threaded later — see 2026-07-24 for the follow-up with Andrei Sech/Dima Bogoslovsky)*

**Андрей Петкевич** (re: Q7):
"Assumptions and Dependencies, bank's Local Currency is still defined centrally in the COMPANY
(Lead Company) record -- это мы расширяем COMPANY Таблицу новым филдом?" - если в COMPANY нет
данного поля, то я бы расширил. Но Андрею виднее. "Может ли она быть Base currency или мы иногда
должны это запрещать? Или всегда?" - может быть или не быть. Общие правила, как и для ин.валют.
Каких-то централизованных запретов я бы не вводил. Всё определяется заведением соответствующих
CURRENCY.ORDER

---

## 2026-07-06

**Dmitry Kirzhanov, 10:53 AM:**
@Dima Bogoslovsky Я сделаль заложил джобу на обновление CURRENCY.RATE в table template по аналогии
с InputSessionCleanupJob. Кинь сюда глаз, плиз, как будет время, как лучше сделать

---

## 2026-07-02

**(unattributed, question raised)**
SOURCE_SYSTEM для чего это поле, откуда enum и как он заполняется?

**Andrei Sech, 2:55 PM:**
лучше к другому Андрею, но в общем оно передается или заполняется вручную. наверно только стоит
Enum поменять на VirtualTable. сложно заранее предугадать список значений

**Dmitry Kirzhanov, 2:55 PM:**
@Андрей Петкевич, есть возможность прояснить смысл этого поля?

**Андрей Петкевич, 3:29 PM:**
> Quoting Dmitry Kirzhanov: "@Андрей Петкевич, есть возможность прояснить смысл этого поля?"

пока - информационные цели, плюс - для отчетности и аудита. далее - возможно использование для
других целей. Тип - VirtualTable лучше. Метод заполнения - вручную либо автоматически/из
интерфейса с соответствующей внешней системой

---

## 2026-07-20

**(chat header note, Mikalai Yudzilevich, 12:38 PM):**
`BASE_CCY_RANK` -> `BASE_RANK`

**Mikalai Yudzilevich, 12:38 PM:**
Коллеги, добрый день. Я сейчас работаю со сторями по модулю курсов, и у меня есть несколько
вопросов - буду писать их в чате, ответьте по возможности.
Система предполагает наличие 3х типов курса для каждой валюты - BID, ASK, MID. Т.к. в требованиях
четко прописано, что курсы мы не рассчитываем, чтобы не попадать на ошибки округления, а берем из
внешних источников - я хочу уточнить, точно ли внешние источники будут предоставлять MID курсы?
насколько я понимаю BID/ASK это курсы определяющиеся рыночным спросом и предложением, тогда как
MID курс это курс для бухгалтерской переоценки MTM валютных активов и обязательств, а так же для
перевода всего в базовую валюту компании в конце дня. Подскажите, откуда все же будет браться MID
курс, и как часто он будет обновляться/изменяться (и будет ли) в течение дня? Или это условно
будет курс ЦБ?

**Dmitry Kirzhanov, 12:39 PM:**
@Андрей Петкевич, нужен твой опытный взгляд

**Andrei Sech, 12:53 PM:**
Ответы (пока предварительные) до ответа/верификации со стороны нашего Андрея SME:
Наличие всех трех типов курсов (BID, ASK, MID) одновременно не является обязательным для каждой
валюты или каждого рынка.
Откуда берется MID курс и как часто обновляется?
Внешние источники действительно предоставляют MID курсы, но их природа и частота обновления
зависят от конкретного "Рынка" (Currency Market):
Официальный курс ЦБ / Нацбанка: самый классический пример MID курса. Он загружается (через API или
вручную) обычно один раз в день (или по мере публикации регулятором) и действует как единый
официальный курс. Рыночный (межбанковский) MID от Reuters/Bloomberg: Внешние биржевые терминалы
всегда транслируют не только Bid и Ask, но и вычисленный Mid-рейт.
Для чего используется MID курс?
В классических системах MID действительно использовался исключительно для бухгалтерии. Но не
только: Кроме переоценки валютных позиций (активов и обязательств) и для перевода сумм в базовую
валюту банка (Base Currency) во время процедуры закрытия дня (COB), есть еще (возможно) прямое
ценообразование для клиентов (Pricing): в некоторых странах есть требования, например, оплата
таможенных пошлин, налогов и пр. по официальному курсу ЦБ.
Итого, внешняя система (или операционист) имеет полное право прислать пакет CURRENCY.ORDER, в
котором указан только RATE_TYPE = MID (например, курс Нацбанка). Внешние терминалы (Bloomberg,
Reuters и др.) предполагаем будут передавать готовый MID курс напрямую в пакете CURRENCY.ORDER,
явно помечая его в массиве как RATE_TYPE = MID

**Mikalai Yudzilevich, 12:44 PM:**
Так же вопрос про разные значения курсов в зависимости от объема операции - я правильно понял что
именно из внешних источников мы будем брать разные курсы под разные объемы? Согласно требований мы
не рассчитываем это сами (The system abandons automated spread derivation. Rates are ingested
explicitly) и получаем их извне (a single CURRENCY.ORDER record accommodates multiple currency
pairs, and each pair accommodates multiple RATE_TYPEs (BID, ASK, MID) and AMT_FROM bands). Просто
для меня это странно звучит что условный блумберг будет формировать валютные пары в зависимости от
объема сделки - мне казалось что он дает нам только общий коридор, а мы уже гибко подходим к
ценообразованию в зависимости от контекста (объема) сделки и текущей конъюнктуры рынка (ну и может
каких то дополнительных факторов)

**Dmitry Kirzhanov:**
@Andrei Sech У меня очень быстрый вопрос -- CURRENCY.ORDER у нас FIN таблица с 4eyes правилом?
(когда казначейство загружает файл с курсами и он распаршивается, мы в Таблице курсы сохраняем в
nau и предполагаем авторизацию этих курсов?)

**Andrei Sech, 4:46 PM:**
я думаю, что как минимум такая возможность должна быть, но можно делать через версию без
авторизации потенциально тоже

**Dmitry Kirzhanov, 4:47 PM:**
Короче вопрос открытый

**Andrei Sech, 4:48 PM:**
просто я к тому, что для тебя неважно должно быть, как настроят. но эта часть покрывается не этой
спекой, а стандартные возможности table registry и projection

**Andrei Sech, 4:50 PM:**
если это балк загрузка из csv, я бы не делал авторизации (в каждую отдельно заходить и авторизовать
ту матч). если отдельные курсы (небольшое количество) вручную, то могут использовать авторизации.
короче, когда много и автоматизировано, я бы скипнул авторизацию

**Dmitry Kirzhanov, 4:55 PM:**
Хорошо, тогда ещё вопрос про bulk -- если из 100 записей 1 или 2 не прошли валидацию, мы отклоняем
весь балк аплоад?

**Andrei Sech, 4:57 PM:**
это лучше спросить у Андрея П. мне кажется бизнесово есть плюсы и минусы у обоих подходов: загрузить
все-или-ничего и загрузить без нескольких ошибочных, но залогинить их или как-то например создать в
холд, чтобы руками поправить и довести

**Mikalai Yudzilevich, 5:06 PM:**
По вашей спеке был только вариант все или ничего) во избежание арбитража

**Andrei Sech, 5:06 PM:**
хорошо, тогда ответ "ничего")

---

## 2026-07-22

**Ilona Fralova, 11:20 AM:**
@Andrei Sech Это будет правильная структура рекорда в CURRENCY.ORDER? По спеке у нас должен быть
массивом CURRENCY_PAIRS?

```json
{
  "recordId": "CORD-001",
  "data": {
    "SOURCE_SYSTEM": "REUTERS",
    "STATUS": "NEW",
    "CCY_MKT": "1",
    "START_DATETIME": "2026-07-23T00:00:00",
    "END_DATETIME": "2026-07-23T23:59:59",
    "UNIT": "HQ",
    "UNIT_INCLUDE": false,
    "CURRENCY_PAIRS": [
      {
        "CCY_BASE": "USD",
        "CCY_QUOTE": "EUR",
        "RATE_BANDS": [
          { "AMT_FROM": "0", "RATE_TYPE": "BID", "RATE_VALUE": "0.9200" },
          { "AMT_FROM": "0", "RATE_TYPE": "ASK", "RATE_VALUE": "0.9300" },
          { "AMT_FROM": "0", "RATE_TYPE": "MID", "RATE_VALUE": "0.9250" },
          { "AMT_FROM": "5000", "RATE_TYPE": "BID", "RATE_VALUE": "0.9500" }
        ]
      },
      {
        "CCY_BASE": "GBP",
        "CCY_QUOTE": "USD",
        "RATE_BANDS": [
          { "AMT_FROM": "0", "RATE_TYPE": "BID", "RATE_VALUE": "1.2600" },
          { "AMT_FROM": "0", "RATE_TYPE": "ASK", "RATE_VALUE": "1.2700" },
          { "AMT_FROM": "0", "RATE_TYPE": "MID", "RATE_VALUE": "1.2650" }
        ]
      }
    ]
  }
}
```

**Andrei Sech, 11:34 AM:**
@Андрей Петкевич

**Andrei Sech, 11:37 AM:**
в детали сейчас не погружаясь, выглядит похоже на правильную. вероятно стоит переименовать CCY_MKT
и т.д. на более полные названия currency, market, ...

---

## 2026-07-23

**Ilona Fralova, 1:37 PM:**
если нам нужна такая вложенная структура (массив в массиве), то есть проблема. у нас такое не
поддерживается, TableJsonSchemaValidator выкидывает `violations.add(path + ": nested groups are not
allowed")`. @Dima Bogoslovsky @Dmitry Kirzhanov + было бы неплохо заалайниться на новые названия
филдов если мы такое хотим

**Ilona Fralova, 3:17 PM:**
@Dmitry Kirzhanov @Dima Bogoslovsky

**Dmitry Kirzhanov, 3:18 PM:**
> Quoting Ilona Fralova: "+ было бы неплохо заалайниться на новые названия филдов если мы такое
> хотим"

Тут решили, Илона теперь знает что делать

**Andrei Sech, 3:35 PM:**
со стороны выглядит как будто капитан на "что? где? когда?" при отсутствии командных версий после
обсуждения говорит: ну а отвечать будет Илона

**Dmitry Kirzhanov, 3:36 PM:**
Мы просто кофе попили ))

**Andrei Sech, 3:36 PM:**
я понял)

**Dmitry Kirzhanov, 4:14 PM:**
@Dima Bogoslovsky @Ilona Fralova В процессе расследования по bulk input мы вышли на то, что его
нет. Проектируем в рамках карренси спеки?

**Dmitry Kirzhanov, 4:58 PM:**
> Quoting Ilona Fralova's CURRENCY.ORDER structure proposal (2026-07-22, above)

@Dima Bogoslovsky, меня пугает, что, по словам @Ilona Fralova мы не можем встроить лист в лист,
чтобы ходить по листу RATE_BANDS, пока мы ходим по листу CURRENCY_PAIRS

**Dima Bogoslovsky, 6:06 PM:**
Мы иак и не может. Балка пока нет

---

## 2026-07-23 (parallel thread — cross-team)

**Yuliya Ivaniushkina, 1:12 PM:**
Коллеги, согласно логике софт аккаунтинга, нам нужно обращаться в CURRENCY для извлечения
CURRENCY.RATE для перерасчета суммы операции по контракту в локальной валюте. Знаю, что с похожей
ситуацией столкнулась команда, занимающаяся транзакциями. Возможно на вашей стороне есть
консолидированное решение по этому вопросу? Буду признательна любой помощи 🙌

**Dmitry Kirzhanov, 1:26 PM:**
Пока не дошли до этого, идёт обсуждение

**Yuliya Ivaniushkina, 2:09 PM:**
@Yury Kiulo FYI

---

## 2026-07-24

**Dima Bogoslovsky, 10:46 AM:**
> Quoting Андрей Петкевич's 2026-07-01 answer to Q7 (see above)

@Andrei Sech Добавим CURRENCY в COMPANY?

**Andrei Sech, 10:47 AM:**
я не против, давай добавим

**Dima Bogoslovsky, 11:02 AM:**
@Dmitry Kirzhanov fyi

---

## 2026-07-27

**Ilona Fralova, 9:45 AM:**
@Andrei Sech в FieldType = RATE у нас по требованиям не запрещены негативные значения. мне казалось
что в каренси модуле у нас должны быть только положительные рейты. это очепятка в требованиях и
нужно поправить валидацию для этого типа или мы ожидаем что где-то еще нам понадобится негативный
рейт?

**Andrei Sech, 10:27 AM:**
да, думаю, что ставки будут строго положительные, но тут тип поля rate в целом все равно наиболее
подходящее. значит надо или дополнить валидацией значения, или расширить атрибутом это поле в DD,
чтобы был positive rate

**Ilona Fralova, 11:44 AM:**
а в целом будут встречаться кейсы с потенциально негативными рейтами вне этой спеки?

**Andrei Sech, 11:46 AM:**
де факто скорее нет, но не стоит ограничивать технически, потому что если даже не процентная
ставка, то как минимум маржа может быть отрицательной

**Dmitry Kirzhanov, 4:59 PM:**
Всем привет. У нас есть требование AC-SYS-01 — Rate Hierarchy Resolution (Business Unit Fallback) и
запрос от других команд про рекурсивный проход по бизнес юнитам, если для входящего юнита нет
рейта в CURRENCY.RATES.
Какой флоу: запрашиваем рейт для бизнес юнита BR-NORTH-01, в Таблице CURRENCY.RATE нету значения
рейта для этого бизнес-юнита, мы должны запросить рейт по иерархии для родительского юнита
BR-NORTH-01, и так вверх по иерархии пока не найдёт бизнес-юнит в иерархии, для которого есть рейт.
Мы накидали решение, ниже диаграмма последовательности (код диаграммы будет в треде).
Вопросы: а) BUSINESS.UNIT Таблица у нас будет реализовываться в М2 или М3? б) если в М3, то что нам
делать в рамках этой спеки? Если посмотрите на диаграмму, то фича обхода вверх по иерархии такая,
что её просто замокать как-бы особо не получится.

**Dmitry Kirzhanov** (sequence diagram, posted in-thread):

```
sequenceDiagram
    autonumber
    actor T as Other Table
    participant CR as CURRENCY.RATE
    participant BU as BUSINESS.UNIT
    T-->>CR: request rate for ID=MM.BR-NORTH-01.USD.EUR
    loop "Pre-hook plugin"
    CR-->>CR: No rates for BR-NORTH-01 found in CURRENCY.RATE
    CR-->>BU: Request unit structure for BR-NORTH-01
    BU-->>CR: Response with org structure //TODO: how response looks like?
    CR-->>CR: check for parent of BR-NORTH-01, e.g BR-GLOBAL-00 in CURRENCY.RATE
    end
    CR-->>CR: SEE core logic execute with BR-GLOBAL-00
    CR-->>T: response with rate for BR-GLOBAL-00
```

---

## 2026-07-28

**Dmitry Kirzhanov, 10:14 AM:**
@Dima Bogoslovsky @Ilona Fralova Дока с архитектурным решением. @Ilona Fralova План реализации

**Dima Bogoslovsky, 10:46 AM:**
а) M3
б) Пока ничего, представим, что рейта не нашлось) По идее такое же может быть? А что на счет
маркетов? Нам же не всегда будет приходить рейт по business unit? Или мы всегда его должны брать из
контекста?

**Dmitry Kirzhanov, 10:52 AM:**
б) Пока ничего, представим, что рейта не нашлось) По идее такое же может быть? -- Конечно может, об
этом и фича рекурсивного прохода вверх по иерархии для поиска рейтов родительского бизнес юнита

**Dima Bogoslovsky, 10:56 AM:**
Да, я к тому, что пока будет просто падать)
Но пока не совсем понятно, по какому принципу будет работать поиск рейтов. Через проекцию или
инкваери? Или нужно приватный апи какой-то сделать? И будет ли это всегда происходить по business
unit?

**Dmitry Kirzhanov, 11:47 AM:**
> Quoting Dima Bogoslovsky's question above

Давай с конца. По спеке вроде да, это будет по бизнес юниту происходить, если нет курса обмена для
отделения Альфы на Уручье, то будет возвращать курс Альфа банка по Минску, если по Минску нет, то
курс по РБ.
Приватный апи куда? Мы из CURRENCY.RATE стучим в таблицу BUSINESS.UNIT и получаем родительский юнит
для того, по которому запросили, дальше ищем рейт по родительскому юниту.
Поиск будет через проекцию CURRENCY.RATE без плагинов, чтобы в текущей реализации не зациклиться

**Dima Bogoslovsky, 5:13 PM:**
> Quoting Dmitry Kirzhanov: "Поиск будет через проекцию CURRENCY.RATE без плагинов, чтобы в
> текущей реализации не зациклиться"

Тут и момент, мы делаем SEE и должны указать, recordId. Но как?

**Dima Bogoslovsky, 5:32 PM:**
@Andrei Sech То есть мы всегда должны знать все 4 параметра, чтобы получить рейт?

---

## 2026-07-28 (parallel thread)

**Dima Bogoslovsky, 10:50 AM:**
@Dmitry Kirzhanov Мы еще говорили, что нужно написать небольшую либку, которая будет делать fx.
Может это так же сделать, если еще не делали?

**Dmitry Kirzhanov, 10:51 AM:**
Небольшую либку которая будет делать форекс?

**Dima Bogoslovsky, 10:57 AM:**
Которая будет делать аплай рейта. Чтобы не писать одно и тоже в разных местах. Мы получили
CURRENCY.RATE. Теперь нужно применить его

---

## 2026-07-28 (bulk INPUT announcement)

**Dmitry Kirzhanov, 12:41 PM:**
@Dima Bogoslovsky @Ilona Fralova @Ilya Vatsevich Коллеги, я закончил с bulk INPUT. Реализация в
рамках currency, но разъезжается сразу по всей системе.
Быстрое саммари:
- дополнительный эндпоинт на балк импут в table template `POST /api/{version}/projections/{projectionId}/records/operations/INPUT/bulk`
- в table registry добавляется флаг `bulkAllowed` в table metadata, сетается при сидинге,
  подтягивается в table template при старте приложения вместе с остальными конфигами группы.
- на стороне table template проверяем состояние флага и либо прогоняем балк через весь пайплайн в
  одной транзакции с прехуками, идемпотенцией и прочим, либо 403 FORBIDDEN
- миграция проходит и таблицы в registry, для которых не определён флаг в сидинге, не аффектаются,
  по дефолту балк импут для них запрещён
- размер bulk size я вынес в SYSTEM.PARAMETER, т.к. настройка валидна для всей системы в поле
  MAX_BULK_BATCH_SIZE, подтягивается при старте приложения, кэшируется (как сейчас пользуемся
  другими значениями из сиспарама)
Полная дока по спецификации и план реализации будет в треде ниже

**Dmitry Kirzhanov, 12:47 PM:**
Описание (если нужно есть вариант на русском для быстрого погружения)

**Ilya Vatsevich, 12:48 PM:**
еще надо будет этот путь добавить в auth-provider, чтобы истио пропускало

**Dmitry Kirzhanov, 12:51 PM:**
Спасибо, добавлю

**Dmitry Kirzhanov, 1:59 PM:**
@Dima Bogoslovsky

**Dmitry Kirzhanov, 2:10 PM:**
@Ilona Fralova https://bank-proj.atlassian.net/browse/TB-2025 — Таска по балк импуту, провалидируй
степы имплементации, плез

**Dmitry Kirzhanov, 2:42 PM:**
@Dima Bogoslovsky В рамках балк импута мы решили вынести MAX_BULK_BATCH_SIZE в SYSTEM.PARAMETER.
Скажи, пожалуйста, что нам не нужно на горячую обновлять этот параметр, и что он может апплаиться
при рестарте пода (как все остальные параметры в SYSTEM.PARAMETER)

---

## 2026-07-29

**Dima Bogoslovsky, 11:29 AM:**
> Quoting Dima Bogoslovsky (2026-07-28, 5:32 PM): "@Andrei Sech То есть мы всегда должны знать все
> 4 параметра, чтобы получить рейт?"

@Андрей Петкевич Можете, пожалуйста, подсказать? Мы подразумеваем, что у всех потребителей
CURRENCY.RATE будет эта информация? Или могут быть кейсы, когда маркет/business unit, etc не
известна

**Dmitry Kirzhanov, 11:37 AM:**
@Андрей Петкевич, и ещё вопрос, в CURRENCY.RATES у нас хранятся актуальные курсы банка. Там могут
храниться курсы, актуальность которых наступает в будущем по времени?

**Андрей Петкевич, 1:08 PM:**
Да. Должны быть обозначены все 4 параметра, и они - будут (либо из данных транзакций, либо
поставлены программным путем)

**Андрей Петкевич, 1:12 PM:**
> Quoting Dmitry Kirzhanov's question above

В CURRENCY.RATES - только актуальные, действующие сейчас, курсы. В CURRENCY.ORDER - могут быть
будущие

---

## 2026-07-31

**Dima Bogoslovsky, 10:16 AM:**
@Dmitry Kirzhanov Подскажи, пожалуйста, как мы берем рейт из таблички? Как мы должны использовать
AMT_FROM? и сколько у нас может быть значений в группе? Как я понял, то 3: 1 для каждой rate_type

**Dmitry Kirzhanov, 10:19 AM:**
Не, структура будет такая другая, сейчас найду скину

**Dmitry Kirzhanov, 10:28 AM:**
```json
{
  "ID": "1.HQ.USD.EUR",
  "ORDER_ID": "ORD-20260703-0001",
  "CCY_MKT": "1",
  "UNIT": "HQ",
  "CCY_BASE": "USD",
  "CCY_QUOTE": "EUR",
  "START_DATETIME": "2026-07-31T09:00:00Z",
  "END_DATETIME": "2026-08-31T09:00:00Z",
  "TIERS": [
    { "AMT_FROM": "0",       "RATE_TYPE": "BID", "RATE_VALUE": "0.9210" },
    { "AMT_FROM": "0",       "RATE_TYPE": "MID", "RATE_VALUE": "0.9211" },
    { "AMT_FROM": "0",       "RATE_TYPE": "ASK", "RATE_VALUE": "0.9212" },
    { "AMT_FROM": "10_000",  "RATE_TYPE": "BID", "RATE_VALUE": "0.9115" },
    { "AMT_FROM": "10_000",  "RATE_TYPE": "MID", "RATE_VALUE": "0.9110" },
    { "AMT_FROM": "10_000",  "RATE_TYPE": "ASK", "RATE_VALUE": "0.910" },
    { "AMT_FROM": "100_000", "RATE_TYPE": "BID", "RATE_VALUE": "0.9045" },
    { "AMT_FROM": "100_000", "RATE_TYPE": "MID", "RATE_VALUE": "0.9046" },
    { "AMT_FROM": "100_000", "RATE_TYPE": "MIASKD", "RATE_VALUE": "0.9028" }
  ]
}
```
@Dima Bogoslovsky ^^

*(Note: `"RATE_TYPE": "MIASKD"` in the third tier's third entry above is exactly as pasted in the
original chat — most likely a typo for `ASK`, not a confirmed fourth rate type. Flag/confirm before
relying on it.)*

**Yuliya Ivaniushkina, 11:31 AM:**
Подскажите, пожалуйста, Soft accounting для перерасчета проводки в локальной валюте, должен забрать
RATE.VALUE. Может ли быть несколько записей для RATE.VALUE для нашего случая (маркет = 1)?
@Андрей Петкевич

**Андрей Петкевич, 11:49 AM:**
Для этого рынка - всегда только одна запись для RATE.VALUE

**Yuliya Ivaniushkina, 12:36 PM:**
> Quoting Андрей Петкевич: "Для этого рынка - всегда только одна запись для RATE.VALUE"

спасибо за помощь

---

## 2026-08-03

**Ilona Fralova, 3:14 PM (edited):**
```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "detail": "Batch INPUT failed for 8 record(s)",
  "error": "BATCH_VALIDATION_FAILED",
  "errors": [
    {
      "index": 0,
      "recordId": "CUO-20260803-0001",
      "message": "RATE_TYPE - does not have a value in the enumeration [BID, ASK, MID], AMT_FROM - is missing"
    },
    {
      "index": 1,
      "recordId": "CUO-20260803-0002",
      "message": "CCY_BASE is not writable through this projection"
    },
    {
      "index": 3,
      "recordId": "CUO-20260803-0004",
      "message": "Errors accumulated for this operation",
      "details": {
        "errors": [
          { "id": "CUO_AMT_ABOVE_DAILY_LIMIT", "params": ["1500000", "1000000"], "targetFieldId": "AMT_FROM" },
          { "id": "CUO_MARKET_CLOSED", "params": ["EURUSD", "2026-08-03T21:15:00Z"] }
        ]
      }
    },
    {
      "index": 4,
      "recordId": "CUO-20260803-0005",
      "message": "Hook execution failed for operation INPUT in PRE phase for projection CURRENCY.ORDER~MASTER",
      "details": { "fieldErrors": { "CCY_QUOTE": "unknown currency 'XYZ'" } }
    },
    {
      "index": 6,
      "recordId": "CUO-20260803-0007",
      "message": "Hook execution failed for operation INPUT in PRE phase for projection CURRENCY.ORDER~MASTER",
      "details": { "lockedFields": { "STATUS": "record is locked by an in-flight settlement" } }
    },
    {
      "index": 7,
      "recordId": "CUO-20260803-0008",
      "message": "Override approval is not supported for batch INPUT",
      "details": {
        "overrides": [
          { "id": "CUO_RATE_OUTSIDE_TOLERANCE", "params": ["1.0854", "1.0800", "0.30"], "targetFieldId": "RATE" }
        ]
      }
    }
  ]
}
```
нам будет норм такое получать в случае фейла батч инпута? @Dima Bogoslovsky @Dmitry Kirzhanov

**Dmitry Kirzhanov, 3:26 PM:**
Имхо норм

**Dima Bogoslovsky, 6:10 PM:**
хз. Выглядит странно

**Ilona Fralova, 6:16 PM:**
Только это? Тут больше суть в том что на каждый зафейленный рекорд выдаётся досье

**Dima Bogoslovsky, 6:26 PM:**
Да, я понимаю. В целом норм. Но index может не указывать думаю. У тебя есть recordId

---

## 2026-08-04

**Dima Bogoslovsky, 4:54 PM:**
@Dmitry Kirzhanov Мы добавляли currency поле для лид компаний?

**Dmitry Kirzhanov, 4:55 PM (edited):**
Таска есть, https://bank-proj.atlassian.net/browse/TB-1447 @Ilona Fralova в процессе реализации

---

## 2026-08-05

**Artur Fonichkin, 12:59 PM:**
@Андрей Петкевич Привет, вопрос по поводу каренси, интересует хранение данных в таблице
CURRENCY.RATES — мы храним только текущие курсы тут или можем хранить за N промежутков времени
допустим на сегодня с 9:00-12:00 и 12:00-15:00 и отдавать юзеру те которые нужны исходя из времени?

**Mikalai Yudzilevich, 1:05 PM:**
Согласно спеке и сторям которые я писал, если я все верно понимаю - нет. В CURRENCY.RATES лежит
только 1 запись для 1 валютной пары в рамках 1 рынка. Т.е. могут быть разные курсы для USD-EUR при
масштабе операции в 100 единиц и 10 000 единиц (розничные и оптовые курсы), а все курсы которые
сформированы на будущее лежат в таблице CURRENCY.ORDER с признаком "дата и время вступления в силу"
- в обозначенные дату и время демон дернет их и перепишет значение в таблице CURRENCY.RATES

**Андрей Петкевич, 1:59 PM:**
Привет! В таблице CURRENCY.RATES хранятся ТОЛЬКО текущие курсы (если они УЖЕ действуют и ЕЩЕ не
истекло время их действия). Все будущие курсы могут находиться только в таблице CURRENCY.ORDER

---

## 2026-08-06

**Mikalai Yudzilevich, 1:22 PM:**
Андрей, а есть ли у Вас возможность выйти со мной на короткий звонок? задам пачку вопросов по
карренси, и в том числе про вышеописанное ограничение

**Mikalai Yudzilevich, 3:21 PM:**
@Андрей Петкевич @Andrei Sech коллеги добрый день. Сейчас с разработчиками разбирали вопросы по
спеке, и я на некоторые из них не могу ответить. Я бы хотел вас попросить: 1) Прочитать мои стори,
которые я написал согласно спеке, чтобы подтвердить что я все интерпретировал верно. 2) Нам нужно
выйти на мит, пройтись по сторям и обсудить как это должно работать, потому что как будто на
некоторые пожелания из спеки есть технические ограничения. Ссылка на стори:
https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1484783640/US-01.13+Currency+Definition+and+Logic
Когда мы сможем сделать мит?

**Андрей Петкевич, 2026-08-07, 11:20 AM:**
@Mikalai Yudzilevich @Andrei Sech я готов пообщаться по Currency в любой рабочий день. Сегодня я
могу в любое время до 16-00 (по Минску). В самом крайнем случае можем пообщаться и без Андрея, но
я вижу там критичные моменты, которые нужно согласовать/информировать с Андреем как с SA по
проекту

---

## 2026-08-10 (Monday, referenced in chat as "Mon")

**Андрей Петкевич, 9:23 AM:**
@Mikalai Yudzilevich @Artur Fonichkin @Ilona Fralova Добрый день! По обсуждаемому в пятницу
открытому вопросу по полю CURRENCY.ORDER>UNIT_INCLUDE моё видение таково, что логика должна быть
следующей:
1) для обработки введенных ордеров требуется наличие сервиса, который будет выполняться с
   интервалом 1 минута и будет отбирать в таблице CURRENCY.ORDER записи со статусом
   CURRENCY.ORDER>STATUS EQ "NEW" и датой и временем (CURRENCY.ORDER>START.DATETIME) меньше либо
   равно текущему времени.
2) если найдено несколько таких записей, то они обрабатываются в порядке увеличения
   CURRENCY.ORDER>START.DATETIME. Если найдено несколько записей с одинаковым
   CURRENCY.ORDER>START.DATETIME, то они обрабатываются в хронологическом порядке создания записи
   – поле CURRENCY.ORDER>DATE.TIME (стандартное поле аудиторского следа во всех таблицах, в т.ч. в
   таблице CURRENCY.ORDER).
3) сервис будет создавать записи в приложении CURRENCY.RATES, если наступило время (текущее время
   равно CURRENCY.ORDER>START.DATETIME).

---

## 2026-08-11 (Tuesday, referenced in chat as "Tue")

**Artur Fonichkin, 10:23 AM:**
У нас в каренси есть ранг валюты, он вообще может измениться или нет? BASE_CCY_RANK @Андрей
Петкевич @Mikalai Yudzilevich

**Андрей Петкевич, 11:28 AM:**
Да, это поле должно быть изменяемым

**Mikalai Yudzilevich, 11:32 AM (edited):**
Но при этом ранк уникален? т.е. не может быть 2х валют с 1 ранком, верно?

**Андрей Петкевич, 11:39 AM:**
Да, ранк должен быть уникальным

**Mikalai Yudzilevich, 4:52 PM:**
Кроме того - после разбора с разработчиками остался еще ряд вопросов:
- **Математика триангуляции (Triangulation Routing):** Подтвердите, пожалуйста, как именно должен
  работать пайплайн при расчете через транзитную валюту. Мы делаем последовательную двойную
  конвертацию самой суммы (Сумма -> Транзит -> Целевая валюта), или же Pricing Engine должен
  сначала математически высчитать единый транзитный кросс-курс и затем применить его к исходной
  сумме один раз?
- **Применение Quotation Code:** На каком этапе применяется QUOTATION_CODE (например, множитель
  для JPY)? Мы правильно понимаем, что таблица CURRENCY.RATES возвращает только "чистый" курс
  (RATE_VALUE), а вызывающий модуль (калькулятор) должен сам сходить в справочник CURRENCY, взять
  оттуда QUOTATION_CODE и применить его при расчете суммы, или эта логика должна быть
  инкапсулирована внутри самого запроса к Rates?
- **Аудиторский след при иерархическом поиске (Fallback) либо триангуляции (Triangulation
  Routing):** Если для филиала курс не найден и система рекурсивно берет курс головного офиса
  (Parent Unit), должны ли мы для прозрачности аудита сохранять ID этого родительского Business
  Unit (или ID конкретного ордера) в регистре истории самой транзакции? Не должны ли мы возвращать
  в респонсе по курсам ID юнита откуда мы подтянули курсы? И аналогичный вопрос при триангуляции -
  не надо ли нам добавить в ответ справочную информацию (через какую валюту, по какому пайплайну
  была выполнена конвертация)?
- **Конфликт приоритетов транзитной валюты:** Если в настройках компании строго включен флаг
  MANDATORY_TRIANGULATION = YES (с жесткой транзитной валютой, например, XAF), но во входящем
  API-запросе в payload явно передана другая транзитная валюта (например, USD) — какое правило
  имеет высший приоритет?

И @Andrei Sech вот этот момент буду благодарен если сможем голосом завтра обсудить - сегодня я
знаю что у Вас день без встреч

---

## 2026-08-12 (Wednesday, referenced in chat as "Wed")

**Mikalai Yudzilevich, 9:26 AM (edited):**
Еще пачка вопросов от разработки:
1) У нас есть в системе Currency Order который начинает действовать с 15.00 на пару EUR/USD.
   Сейчас на часах 11.00 (т.е. до исполнения ордера еще есть время). В таблицу CurrencyOrder
   приходит новый ордер на ту же пару и на то же время (допустим что то произошло на рынке, и
   курсы обновились - старые стали неактуальными). Вопрос: что происходит со старым ордером? Мы
   его просто перезаписываем? Возможно нам стоит добавить какой то статус о том что ордер был
   отменен машиной?
2) У нас есть ордер который начнет действовать с 15.00 и он пришел первым. После система получает
   новый ордер, который начинает действовать с 14.00 - как в таком случае должна повести себя
   система? Должен ли старый ордер перезаписаться т.к. мы получили более актуальные курсы, или же
   новый ордер будет действовать с 14 до 15, а в 15 система перепишет курсы согласно первого
   ордера?
3) Имеет ли кто-либо (например казначейство) прямой доступ в таблицу CurrencyRates? В пятницу мы
   договорились что на исполнение ордера нужен таймлаг, и установили его на уровне 5 минут. Может
   ли быть ситуация что надо курсы переписать прям мгновенно? В моей картине мира - нет, мы никому
   не даем доступ к CurrencyRates чтобы исключить любые ошибки/человеческий фактор, а все изменения
   по рейтам вносятся через ордера. Возможно тут следует продумать механизм Emergency изменения
   рейтов руками, когда после сохранения ордера старые курсы из CurrencyRates удаляются а потом
   перезаписываются новыми вне очереди (таким образом мы зафейлим все операции которые постараются
   получить доступ к уже не актуальным курсам до момента их перезаписи новыми)
4) Обсудить формат в котором рейты запрашивает FT и ожидаемый ответ

**Andrei Sech, 9:26 AM:**
давай я Андрея все-таки добавлю и вместе обсудим)

**Андрей Петкевич, 3:22 PM:**
@Mikalai Yudzilevich ещё пара замечаний по сторям:
1. Стр. 19: "The Pricing Engine resolves the transit currency from either the explicit API query
   parameters, or the local (local – имеется ввиду локальная валюта? Нет, может быть не локальной.
   Или имеется ввиду - локально/в системе заданная? Это верно) transit currency defined in the
   branch's COMPANY table (TRIANGULATION_CCY fallback to LOCAL_CURRENCY) (fallback to
   LOCAL_CURRENCY - только если TRIANGULATION_MANDATORY=YES, а TRIANGULATION_CCY оставлено пустым.
   А так - TRIANGULATION_CCY может быть заведено любое), or the global SYSTEM.PARAMETER record
   (transit currency задаем только в COMPANY table!)."
2. Стр. 22: "GIVEN a live rate table with AMT_FROM bands set at 0 and 10,000 WHEN the Funds
   Transfer module requests a rate for a 15,000 USD transaction THEN the system automatically
   selects and returns the rate tied to the 10,000 tier" (нет. Курс будет выбран из рейнджа от
   10,000 и выше (если этот рейндж не ограничен 14,999. Если ограничен, то в соответствующий
   подходящий рейндж).

**Artur Fonichkin, 3:30 PM:**
@Андрей Петкевич Привет, вы сегодня на мите обсуждали момент по каренси, вопрос — если у меня на
15-00 пришло 2 курса usd/eur и они оба new, я должен только последний кинуть в CURRENCY.RATES?

**Mikalai Yudzilevich, 3:34 PM:**
Приду расскажу

**Андрей Петкевич, 3:37 PM:**
В реальной жизни - такого не будет. Либо если потенциально такое может быть - будут прописаны
специально отдельные правила в данном случае для конкретного интерфейса/источника (например:
апдейт последними данными первого (и единственного) ордера. Либо другой вариант: отмена
первоначального ордера и ввод нового). Если этого нигде специально больше не прописано, то будет
применен универсальный механизм, который мы проговорили ранее заложить в системе: загрузка каждого
ордера с одинаковым началом действия - последовательно, по хронологии поступления

---

## 2026-08-13 (referenced in chat as "Yesterday" relative to 2026-08-14)

**Artur Fonichkin, 9:19 AM:**
@Mikalai Yudzilevich привет, вопрос по тому какие данные мы должны ещё возвращать вместе с рейтом,
как метаданные? я предлагаю возвращать примерно такое боди
```json
{
  "baseCurrency": "USD",
  "quoteCurrency": "EUR",
  "rateType": "BID",
  "transitCurrency": "BYN",
  "rateValue": 0.912345678901234567
}
```
(transitCurrency optional if direct rate, it is null)

**Ilona Fralova, 9:20 AM:**
еще вчера решили что будем возвращать коридор в который попала сумма

**Mikalai Yudzilevich, 9:21 AM (edited):**
Мы вчера когда обсуждали, мы поняли что надо вернуть: rate, quotation_code, base currency, quote
currency, amount from-amount to. Амаунт - это как раз коридор

**Ilona Fralova, 9:21 AM:**
> Quoting Mikalai Yudzilevich: "Амаунт - это как раз коридор"

это одна цифра. коридор - две

**Mikalai Yudzilevich, 9:21 AM:**
> Quoting Ilona Fralova: "коридор - две"

Ок, согласен

**Ilona Fralova, 9:21 AM:**
а по итогу что нам нужно?

**Mikalai Yudzilevich, 9:22 AM:**
Поправил. Коридор нужен. Чтобы показать что запрошенная сумма попадает в коридор

**Artur Fonichkin, 9:22 AM:**
ок, тогда как должен выглядеть ответ, @Mikalai Yudzilevich можешь это как json изобразить?

**Mikalai Yudzilevich, 9:23 AM:**
Да, дай пару минут

**Artur Fonichkin, 9:24 AM:**
amount к нам приходит как
```json
{ "amount": { "units": 100, "nanos": 20 } }
```
т.е. 100,20 USD например. Вернуть должны явно в таком же формате

**Mikalai Yudzilevich, 9:25 AM:**
Не, тут идея была не сумму вернуть, сумма нам не важна - а вернуть коридор в который попадает сумма
и на основании которого был сформирован рейт

**Mikalai Yudzilevich, 9:31 AM:**
> Quoting Artur Fonichkin: "ок, тогда как должен выглядеть ответ, можешь это как json изобразить?"

```json
{
  "base_currency": "USD",
  "quote_currency": "JPY",
  "quotation_code": 2,
  "amount_from": 0,
  "amount_to": 10000,
  "rate_value": 150.75
}
```

**Artur Fonichkin, 9:31 AM:**
если юзали какую то транзитную валюту для пересчёта, нам не нужно это отобразить?

**Mikalai Yudzilevich, 9:32 AM:**
Нет. Это обсудили - можно будет в логах поднять

**Mikalai Yudzilevich, 9:32 AM (edited):**
Мы и так уже нарушаем изначальные требования спеки в части high tps response

**Artur Fonichkin, 9:33 AM:**
Можем и по спеке вернуть `{"rate_value": 150.75}` и всё) Нам как провайдеру это вообще не
принципиально) но для того кто это будет считать могут быть критичными некоторые поля

**Mikalai Yudzilevich, 9:34 AM (edited):**
> Quoting Artur Fonichkin: "Можем и по спеке вернуть {rate_value: 150.75} и всё)"

Ну к примеру FT запрос который ты показывал - ему просто рейта не хватит, может быть косяк

**Artur Fonichkin, 9:34 AM:**
тут согласен поэтому и даю инфу))

**Mikalai Yudzilevich, 9:35 AM (edited):**
Да, я понимаю) в общем пример респонса скинул, думаю что тут вопрос закрыт, верно?

**Dima Bogoslovsky, 9:36 AM:**
А зачем нужен будет amount_from-amount_to?

**Mikalai Yudzilevich, 9:37 AM:**
Чтобы показать что запрошенная сумма попадает в коридор по которому курс сформирован

**Dima Bogoslovsky, 9:38 AM:**
Консьюмер же не знает ничего об этих коридорах. Может и не нужно ему знать

**Mikalai Yudzilevich, 9:39 AM:**
Есть ли причина техническая почему нам это сложно сделать?

**Dima Bogoslovsky, 9:39 AM:**
Не сложно. Нужна причина зачем это

**Mikalai Yudzilevich, 9:40 AM:**
Для того чтобы запрашивающий точно понимал, что ему вернулся курс не просто по паре а по паре + по
коридору. Но в целом я не стою жёстко на этом моменте

**Dima Bogoslovsky, 9:40 AM:**
Я не против, просто что ему это даст? Что он будет с ним делать) Я больше об этом

**Mikalai Yudzilevich, 9:46 AM:**
1) Для витрин (запросы без суммы). Если фронт просит курсы без конкретной суммы, нам нужно отдать
   всю сетку. Без этих полей внешние системы просто не поймут наши объемные скидки.
2) Прозрачность. Даже если мы подобрали курс под конкретную сумму из запроса, мы возвращаем
   границы коридора, чтобы было понятно, почему применился именно этот тариф (например, сработала
   скидка за объем > 10 000).
3) чисто в теории ещё вопрос снижения нагрузки, типа если сумма попадает в тот же коридор, то фронт
   без запроса может пересчитать т.к. курс известен, но тут очень спорно
Если такого обоснования недостаточно - то давайте вырезать, мне больше нечем крыть))

**Dima Bogoslovsky, 9:51 AM:**
> Quoting point 1 above

Фронт отдельная тема) Currency Engine не будет иметь (на данный момент) доступа на фронт. Его будут
запрашивать другие таблицы (Funds Transfer, Product Factory). На фронте у нас есть только
функционал работы через таблицы, то есть получить CURRENCY.RATE через SEE, сделать enquiry

**Dima Bogoslovsky, 9:54 AM (edited):**
> Quoting point 2 above

FT/PF просит сделать fx, я думаю ему без разницы в какой ренж/base ccy он попал, он берет рейт и
идет дальше

> Quoting point 3 above

Это аргумент) Но тут тогда FT/PF должны понимать expiry этого рейта и кешить его, но мы решили что
пока кешить не будет, а если и будет то прямо на currency engine

---

## 2026-08-13 (parallel thread)

**Artur Fonichkin, 3:51 PM:**
@Mikalai Yudzilevich Привет, на всякий случай уточню, мы для всех типов курсов (MID/ASK/BID) по
любому из них идем по стандартному флоу parent Business Unit -> транзитные валюты?

**Mikalai Yudzilevich (edited):**
Ну получается что да, я не вижу тут исключений

**Artur Fonichkin, 4:48 PM:**
@Mikalai Yudzilevich Ещё вопрос, если к нам пришёл 1 ордер вручную, допустим на 15, а его
авторизовали только в 15-30, что мы с этим делаем?

**Mikalai Yudzilevich, 2026-08-14, 9:29 AM:**
> Quoting Artur Fonichkin's question above

Ну тут вопрос про изменение старт дей-тайм параметра. Как я предлагал - при авторизации изменять
параметр на таймнау+лаг, через оверрайд

**Artur Fonichkin, 9:32 AM:**
Конкретный кейс, были созданы курсы на 15, их авторизовали в 16, но у меня применился новый курс
который был в 15-30, и по факту если я перепишу дату начало старого то он перепишет, второй курс
который был применен в 15-30, так?

---

## 2026-08-14 (today)

**Mikalai Yudzilevich:**
@Andrei Sech @Андрей Петкевич коллеги прошу согласовать:

Хотим вынести на согласование предложение по обработке кейса с авторизацией валютных курсов в
«пограничное» время.

1. **В чём проблема сейчас (конфликт таймлага):** Менеджер заводит курс со временем начала действия
   (например, в 15:00) и отправляет на авторизацию. На момент проверки (допустим, в 14:59) до
   старта остается 1 минута. Однако у системы есть жесткий параметр — таймлаг на подтверждение (2
   минуты). Система проверяет условие: Время старта >= Текущее время + Таймлаг. Если условие не
   выполняется, система не пропустит запись. По техническим причинам мы не можем реализовать
   автоматическое изменение времени при авторизации.
2. **К какому риску это приводит («День сурка»):** Менеджер получает отказ, закладывает новое
   время (например, +10 минут) и отправляет повторно. Если авторизатор опять не успевает зайти в
   узкое временное окно, запись снова отклоняется. Процесс зацикливается, а актуализация курсов
   блокируется.
3. **Предлагаемое решение:** Добавить чекбокс Urgent («Срочно») при создании записи:
   - Как это работает: Мы столкнулись с проблемой того что авторизатор не может провести запись по
     времени. Он возвращает ее обратно создателю.
   - При включенном чекбоксе Urgent система перестает требовать ввод параметра Start Date Time
     (время начала действия).
   - Результат: Запись успешно проходит авторизацию без привязки к жесткому стартовому времени, а
     сами курсы применяются системой ASAP (сразу после момента авторизации).

Просьба согласовать данный подход или поделиться фидбеком, если есть комментарии.

*(Status as pasted into this log: pending Andrei Sech/Андрей Петкевич response — not yet
approved.)*
