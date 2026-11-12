// Казуал Хаб: «Загадка дня» в Мнении (страница — opinion/riddle.js). Каждый день одна загадка на всех:
// угадать игру, фильм, сериал или аниме по подсказкам. 6 попыток; после каждой неверной открывается следующая
// подсказка. Ответ уходит на страницу только когда отгадал или кончились попытки. День — по Киеву.
// Опыт за отгадку — правило riddle (functions/_lib/levels.js), один раз в день; достижение «Отгадчик» — по журналу.
import { dayKey } from './levels.js';

export const MAX_TRIES = 6;
export const RIDDLE_TZ = 'Europe/Kiev';
const LAUNCH = Date.UTC(2026, 10, 12); // загадка №1
const TYPE = { game: 'Игра', movie: 'Фильм', series: 'Сериал', anime: 'Аниме' };

// t — тип; a — ответ, как его показывают; en — английское название; y — год; g — жанр; by — кто сделал; d — описание без названия;
// al — ещё варианты написания (сравнение без регистра, «ё» = «е», без знаков)
export const POOL = [
  { t: 'game', a: 'Ведьмак 3: Дикая Охота', en: 'The Witcher 3: Wild Hunt', y: 2015, g: 'ролевая игра с открытым миром', by: 'Разработчик: CD Projekt Red', d: 'Охотник на чудовищ ищет приёмную дочь, за которой гонится призрачная армия.', al: ['ведьмак 3', 'witcher 3', 'the witcher 3', 'ведьмак'] },
  { t: 'game', a: 'Minecraft', y: 2011, g: 'песочница', by: 'Разработчик: Mojang', d: 'Мир из кубов: копай, строй и держись подальше от криперов.', al: ['майнкрафт', 'майн'] },
  { t: 'game', a: 'Dark Souls', y: 2011, g: 'экшен-RPG', by: 'Разработчик: FromSoftware', d: 'Проклятая нежить зажигает костры, умирает и пробует снова.', al: ['дарк соулс', 'dark souls 1', 'дарк соулс 1'] },
  { t: 'game', a: 'Half-Life 2', y: 2004, g: 'шутер от первого лица', by: 'Разработчик: Valve', d: 'Учёный с монтировкой воюет с инопланетным Альянсом в Сити 17.', al: ['халф лайф 2', 'халва 2', 'hl2', 'half life 2'] },
  { t: 'game', a: 'Portal', y: 2007, g: 'головоломка от первого лица', by: 'Разработчик: Valve', d: 'Испытуемая проходит тесты с порталами под присмотром язвительного ИИ. Торт обещан.', al: ['портал', 'portal 1'] },
  { t: 'game', a: 'GTA V', en: 'Grand Theft Auto V', y: 2013, g: 'экшен с открытым миром', by: 'Разработчик: Rockstar North', d: 'Три грабителя — Майкл, Франклин и Тревор — готовят налёты в Лос-Сантосе.', al: ['gta 5', 'гта 5', 'гта', 'grand theft auto 5', 'gta'] },
  { t: 'game', a: 'Skyrim', en: 'The Elder Scrolls V: Skyrim', y: 2011, g: 'ролевая игра с открытым миром', by: 'Разработчик: Bethesda Game Studios', d: 'Драконорождённый возвращается на север, когда в небе снова появились драконы.', al: ['скайрим', 'tes 5', 'elder scrolls 5', 'the elder scrolls 5'] },
  { t: 'game', a: 'Red Dead Redemption 2', y: 2018, g: 'вестерн с открытым миром', by: 'Разработчик: Rockstar Games', d: 'Банда Датча ван дер Линде уходит от закона на закате Дикого Запада.', al: ['рдр 2', 'rdr 2', 'rdr2', 'red dead 2', 'ред дед редемпшен 2'] },
  { t: 'game', a: 'Hollow Knight', y: 2017, g: 'метроидвания', by: 'Разработчик: Team Cherry', d: 'Маленький безмолвный рыцарь спускается в павшее королевство насекомых.', al: ['холлоу найт', 'холлоу кнайт'] },
  { t: 'game', a: 'Terraria', y: 2011, g: '2D-песочница', by: 'Разработчик: Re-Logic', d: 'Копай, строй и призывай боссов вроде Глаза Ктулху.', al: ['террария'] },
  { t: 'game', a: 'CS:GO', en: 'Counter-Strike: Global Offensive', y: 2012, g: 'командный тактический шутер', by: 'Разработчик: Valve', d: 'Террористы ставят бомбу, спецназ её обезвреживает. «Раш Б!»', al: ['csgo', 'cs go', 'кс го', 'ксго', 'контра', 'counter strike global offensive', 'кс'] },
  { t: 'game', a: 'Dota 2', y: 2013, g: 'MOBA', by: 'Разработчик: Valve', d: 'Две команды по пять героев ломают вражеский Древний.', al: ['дота 2', 'дота', 'dota'] },
  { t: 'game', a: 'Stardew Valley', y: 2016, g: 'симулятор фермы', by: 'Разработчик: ConcernedApe', d: 'Офисный работник уезжает на дедушкину ферму у тихого городка.', al: ['стардью валли', 'стардью'] },
  { t: 'game', a: 'Undertale', y: 2015, g: 'ролевая игра', by: 'Разработчик: Тоби Фокс', d: 'Ребёнок падает в подземелье монстров, и никого не обязательно убивать.', al: ['андертейл', 'андертэйл'] },
  { t: 'game', a: 'Doom', y: 2016, g: 'шутер от первого лица', by: 'Разработчик: id Software', d: 'Палач Рока рвёт демонов на Марсе под тяжёлый метал.', al: ['дум', 'doom 2016', 'дум 2016'] },
  { t: 'game', a: 'Cyberpunk 2077', y: 2020, g: 'ролевая игра с открытым миром', by: 'Разработчик: CD Projekt Red', d: 'Наёмник Ви носит в голове цифровую копию рокера Джонни Сильверхенда.', al: ['киберпанк 2077', 'киберпанк', 'cyberpunk'] },
  { t: 'game', a: 'Among Us', y: 2018, g: 'социальная дедукция', by: 'Разработчик: Innersloth', d: 'Экипаж корабля ищет предателя среди своих, а он чинит то, что сам сломал.', al: ['амонг ас', 'амонгас'] },
  { t: 'game', a: 'Fallout: New Vegas', y: 2010, g: 'ролевая игра', by: 'Разработчик: Obsidian Entertainment', d: 'Курьер выжил после выстрела в голову и ищет платиновую фишку в пустыне Мохаве.', al: ['new vegas', 'нью вегас', 'фоллаут нью вегас', 'fallout new vegas'] },
  { t: 'game', a: 'Мафия', en: 'Mafia', y: 2002, g: 'экшен от третьего лица', by: 'Разработчик: Illusion Softworks', d: 'Таксист Томми Анджело случайно становится частью семьи Сальери.', al: ['mafia', 'мафия 1', 'mafia 1'] },
  { t: 'game', a: 'S.T.A.L.K.E.R.: Тень Чернобыля', en: 'S.T.A.L.K.E.R.: Shadow of Chernobyl', y: 2007, g: 'шутер с элементами RPG', by: 'Разработчик: GSC Game World', d: 'Меченый идёт по Зоне отчуждения с одной задачей: убить Стрелка.', al: ['сталкер', 'stalker', 'тень чернобыля', 'сталкер тень чернобыля'] },
  { t: 'game', a: 'Elden Ring', y: 2022, g: 'экшен-RPG с открытым миром', by: 'Разработчик: FromSoftware', d: 'Погасший идёт по Междуземью, чтобы собрать осколки разбитого Кольца.', al: ['элден ринг', 'елден ринг'] },
  { t: 'game', a: 'Disco Elysium', y: 2019, g: 'ролевая игра', by: 'Разработчик: ZA/UM', d: 'Детектив с жутким похмельем и потерянной памятью расследует убийство в Ревашоле.', al: ['диско элизиум'] },
  { t: 'movie', a: 'Интерстеллар', en: 'Interstellar', y: 2014, g: 'научная фантастика', by: 'Режиссёр: Кристофер Нолан', d: 'Пилот улетает через червоточину искать новый дом для людей, оставив дочь на Земле.', al: ['interstellar'] },
  { t: 'movie', a: 'Начало', en: 'Inception', y: 2010, g: 'фантастический триллер', by: 'Режиссёр: Кристофер Нолан', d: 'Воры проникают в чужие сны, чтобы подсадить идею. Волчок ещё крутится?', al: ['inception'] },
  { t: 'movie', a: 'Матрица', en: 'The Matrix', y: 1999, g: 'научная фантастика', by: 'Режиссёры: Вачовски', d: 'Хакер узнаёт, что мир — симуляция, и выбирает красную таблетку.', al: ['the matrix', 'matrix'] },
  { t: 'movie', a: 'Бойцовский клуб', en: 'Fight Club', y: 1999, g: 'драма', by: 'Режиссёр: Дэвид Финчер', d: 'Клерк с бессонницей и продавец мыла открывают подпольный клуб. Первое правило — молчать.', al: ['fight club'] },
  { t: 'movie', a: 'Криминальное чтиво', en: 'Pulp Fiction', y: 1994, g: 'криминальная драма', by: 'Режиссёр: Квентин Тарантино', d: 'Двое гангстеров, боксёр и жена босса — истории перемешаны во времени.', al: ['pulp fiction'] },
  { t: 'movie', a: 'Брат', y: 1997, g: 'криминальная драма', by: 'Режиссёр: Алексей Балабанов', d: 'Демобилизованный Данила приезжает в Петербург к старшему брату.', al: ['brat', 'брат 1'] },
  { t: 'movie', a: 'Титаник', en: 'Titanic', y: 1997, g: 'драма', by: 'Режиссёр: Джеймс Кэмерон', d: 'Художник и девушка из высшего общества влюбляются на лайнере, который «не потонет».', al: ['titanic'] },
  { t: 'movie', a: 'Шрек', en: 'Shrek', y: 2001, g: 'мультфильм', by: 'Студия: DreamWorks Animation', d: 'Огр спасает принцессу из башни, чтобы ему вернули болото.', al: ['shrek', 'шрек 1'] },
  { t: 'movie', a: 'Король Лев', en: 'The Lion King', y: 1994, g: 'мультфильм', by: 'Студия: Walt Disney Animation', d: 'Львёнок сбегает после гибели отца и однажды должен вернуться за троном.', al: ['the lion king', 'lion king'] },
  { t: 'movie', a: 'Зелёная миля', en: 'The Green Mile', y: 1999, g: 'драма', by: 'Режиссёр: Фрэнк Дарабонт', d: 'Надзиратель блока смертников знакомится с заключённым, который творит чудеса.', al: ['the green mile', 'green mile'] },
  { t: 'movie', a: 'Побег из Шоушенка', en: 'The Shawshank Redemption', y: 1994, g: 'драма', by: 'Режиссёр: Фрэнк Дарабонт', d: 'Банкира сажают за убийство жены, и он годами готовит тихий план.', al: ['shawshank redemption', 'шоушенк', 'побег из шоушенка'] },
  { t: 'movie', a: 'Тёмный рыцарь', en: 'The Dark Knight', y: 2008, g: 'супергеройский боевик', by: 'Режиссёр: Кристофер Нолан', d: 'Герой в плаще против клоуна, который просто хочет посмотреть, как горит мир.', al: ['the dark knight', 'dark knight'] },
  { t: 'movie', a: 'Назад в будущее', en: 'Back to the Future', y: 1985, g: 'фантастическая комедия', by: 'Режиссёр: Роберт Земекис', d: 'Подросток на машине времени попадает в 1955 год и мешает знакомству своих родителей.', al: ['back to the future'] },
  { t: 'movie', a: 'Иван Васильевич меняет профессию', y: 1973, g: 'комедия', by: 'Режиссёр: Леонид Гайдай', d: 'Машина времени меняет местами управдома и царя.', al: ['иван васильевич'] },
  { t: 'movie', a: 'Джентльмены', en: 'The Gentlemen', y: 2019, g: 'криминальная комедия', by: 'Режиссёр: Гай Ричи', d: 'Американец решает продать свою травяную империю в Лондоне, и начинается охота.', al: ['the gentlemen', 'gentlemen'] },
  { t: 'movie', a: 'Дюна', en: 'Dune', y: 2021, g: 'научная фантастика', by: 'Режиссёр: Дени Вильнёв', d: 'Наследник знатного дома попадает на пустынную планету с гигантскими червями.', al: ['dune', 'дюна 1'] },
  { t: 'movie', a: 'Аватар', en: 'Avatar', y: 2009, g: 'научная фантастика', by: 'Режиссёр: Джеймс Кэмерон', d: 'Бывший морпех в теле синего великана переходит на сторону жителей Пандоры.', al: ['avatar'] },
  { t: 'movie', a: 'Остров проклятых', en: 'Shutter Island', y: 2010, g: 'психологический триллер', by: 'Режиссёр: Мартин Скорсезе', d: 'Маршал ищет сбежавшую пациентку психиатрической клиники на острове.', al: ['shutter island'] },
  { t: 'series', a: 'Во все тяжкие', en: 'Breaking Bad', y: 2008, g: 'криминальная драма', by: 'Создатель: Винс Гиллиган', d: 'Школьный учитель химии со смертельным диагнозом начинает варить мет.', al: ['breaking bad'] },
  { t: 'series', a: 'Игра престолов', en: 'Game of Thrones', y: 2011, g: 'фэнтези', by: 'Создатели: Дэвид Бениофф и Д. Б. Уайсс', d: 'Знатные дома воюют за Железный трон, а за Стеной приближается зима.', al: ['game of thrones', 'got'] },
  { t: 'series', a: 'Очень странные дела', en: 'Stranger Things', y: 2016, g: 'научная фантастика', by: 'Создатели: братья Даффер', d: 'Друзья ищут пропавшего мальчика и находят девочку с необычными способностями.', al: ['stranger things'] },
  { t: 'series', a: 'Друзья', en: 'Friends', y: 1994, g: 'ситком', by: 'Создатели: Дэвид Крейн и Марта Кауффман', d: 'Шестеро друзей в Нью-Йорке и диван в любимой кофейне.', al: ['friends'] },
  { t: 'series', a: 'Шерлок', en: 'Sherlock', y: 2010, g: 'детектив', by: 'Создатели: Стивен Моффат и Марк Гэтисс', d: 'Гениальный сыщик и военный врач раскрывают дела в современном Лондоне.', al: ['sherlock'] },
  { t: 'series', a: 'Чернобыль', en: 'Chernobyl', y: 2019, g: 'историческая драма', by: 'Создатель: Крейг Мазин', d: 'Авария 1986 года и люди, которые разбирались с её последствиями.', al: ['chernobyl'] },
  { t: 'series', a: 'Мандалорец', en: 'The Mandalorian', y: 2019, g: 'космический вестерн', by: 'Создатель: Джон Фавро', d: 'Охотник за головами в шлеме берёт под защиту загадочного зелёного малыша.', al: ['the mandalorian', 'mandalorian'] },
  { t: 'series', a: 'Офис', en: 'The Office', y: 2005, g: 'ситком-мокьюментари', by: 'Создатель американской версии: Грег Дэниелс', d: 'Будни бумажной компании под руководством самого неловкого начальника на свете.', al: ['the office', 'office'] },
  { t: 'series', a: 'Острые козырьки', en: 'Peaky Blinders', y: 2013, g: 'криминальная драма', by: 'Создатель: Стивен Найт', d: 'Банда семьи Шелби в послевоенном Бирмингеме прячет бритвы в кепках.', al: ['peaky blinders'] },
  { t: 'series', a: 'Рик и Морти', en: 'Rick and Morty', y: 2013, g: 'мультсериал', by: 'Создатели: Джастин Ройланд и Дэн Хармон', d: 'Безумный учёный таскает внука по параллельным вселенным.', al: ['rick and morty', 'рик и морти'] },
  { t: 'series', a: 'Симпсоны', en: 'The Simpsons', y: 1989, g: 'мультсериал', by: 'Создатель: Мэтт Грейнинг', d: 'Жёлтая семья из Спрингфилда: Гомер, Мардж, Барт, Лиза и Мэгги.', al: ['the simpsons', 'simpsons'] },
  { t: 'anime', a: 'Атака титанов', en: 'Attack on Titan', y: 2013, g: 'тёмное фэнтези', by: 'Студия первых сезонов: Wit Studio', d: 'Люди прячутся за огромными стенами от великанов-людоедов.', al: ['attack on titan', 'shingeki no kyojin', 'атака на титанов'] },
  { t: 'anime', a: 'Тетрадь смерти', en: 'Death Note', y: 2006, g: 'психологический триллер', by: 'Студия: Madhouse', d: 'Школьник находит тетрадь: чьё имя в неё записано, тот умирает.', al: ['death note'] },
  { t: 'anime', a: 'Стальной алхимик: Братство', en: 'Fullmetal Alchemist: Brotherhood', y: 2009, g: 'фэнтези', by: 'Студия: Bones', d: 'Двое братьев ищут философский камень, чтобы вернуть свои тела.', al: ['fullmetal alchemist', 'fullmetal alchemist brotherhood', 'стальной алхимик'] },
  { t: 'anime', a: 'Наруто', en: 'Naruto', y: 2002, g: 'сёнэн', by: 'Студия: Pierrot', d: 'Шумный ниндзя с лисьим демоном внутри мечтает стать главой деревни.', al: ['naruto'] },
  { t: 'anime', a: 'Ван-Пис', en: 'One Piece', y: 1999, g: 'приключения', by: 'Студия: Toei Animation', d: 'Резиновый пират собирает команду, чтобы найти величайшее сокровище.', al: ['one piece', 'ван пис', 'ванпис'] },
  { t: 'anime', a: 'Магическая битва', en: 'Jujutsu Kaisen', y: 2020, g: 'тёмное фэнтези', by: 'Студия: MAPPA', d: 'Школьник проглатывает палец проклятого короля и становится магом.', al: ['jujutsu kaisen'] },
  { t: 'anime', a: 'Человек-бензопила', en: 'Chainsaw Man', y: 2022, g: 'экшен', by: 'Студия: MAPPA', d: 'Парень в долгах сливается с демоном-собакой и заводит бензопилы прямо из головы.', al: ['chainsaw man', 'человек бензопила'] },
  { t: 'anime', a: 'Унесённые призраками', en: 'Spirited Away', y: 2001, g: 'полнометражное фэнтези', by: 'Режиссёр: Хаяо Миядзаки', d: 'Девочка попадает в купальню для духов, а её родители превратились в свиней.', al: ['spirited away'] },
  { t: 'anime', a: 'Ковбой Бибоп', en: 'Cowboy Bebop', y: 1998, g: 'космический нуар', by: 'Студия: Sunrise', d: 'Охотники за головами летают на старом корабле под джаз.', al: ['cowboy bebop'] },
  { t: 'anime', a: 'Евангелион', en: 'Neon Genesis Evangelion', y: 1995, g: 'меха', by: 'Студия: Gainax', d: 'Подростки пилотируют гигантских роботов против загадочных Ангелов.', al: ['evangelion', 'neon genesis evangelion', 'ева'] },
  { t: 'anime', a: 'Твоё имя', en: 'Your Name', y: 2016, g: 'полнометражная драма', by: 'Режиссёр: Макото Синкай', d: 'Деревенская школьница и токийский парень просыпаются в телах друг друга.', al: ['your name', 'kimi no na wa'] },
  { t: 'anime', a: 'Ванпанчмен', en: 'One-Punch Man', y: 2015, g: 'комедийный экшен', by: 'Студия первого сезона: Madhouse', d: 'Лысый герой побеждает любого врага одним ударом и страшно скучает.', al: ['one punch man', 'ванпанчмен'] },
  { t: 'anime', a: 'Невероятные приключения ДжоДжо', en: "JoJo's Bizarre Adventure", y: 2012, g: 'приключения', by: 'Студия: David Production', d: 'Поколения одной семьи сражаются с вампиром Дио и его наследием.', al: ['jojo', 'джоджо', 'jojos bizarre adventure', 'jojo bizarre adventure'] },
];

// ---------- сравнение ответов ----------
export const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/&/g, 'and').replace(/[^a-zа-я0-9]+/g, '');
function lev1(a, b) { // расстояние не больше 1?
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
export function isRight(r, guess) {
  const g = norm(guess);
  if (!g) return false;
  const all = [r.a, r.en, ...(r.al || [])].filter(Boolean).map(norm);
  if (all.includes(g)) return true;
  // опечатка прощается только в буквах: цифры (номер части) должны совпасть — «Ведьмак 2» не «Ведьмак 3»
  const digits = (x) => x.replace(/[^0-9]/g, '');
  return g.length >= 6 && all.some((x) => x.length >= 6 && digits(x) === digits(g) && lev1(g, x));
}

// ---------- загадка дня ----------
// день по Киеву → номер загадки (№1 — 12 ноября 2026) → место в перемешанном с постоянным зерном списке
function order() {
  let s = 20261112 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = POOL.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const ORDER = order();
export function riddleOf(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const idx = Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 864e5);
  const k = ((idx % POOL.length) + POOL.length) % POOL.length;
  return { n: idx + 1, r: POOL[ORDER[k]] };
}
export function hintsOf(r) {
  const letters = norm(r.a);
  return [`${TYPE[r.t] || 'Тайтл'}, ${r.y} год`, `Жанр: ${r.g}`, r.by, r.d, `Название начинается на «${r.a[0].toUpperCase()}», длина — ${letters.length} (буквы и цифры без пробелов)`];
}
export const NAMES = [...new Set(POOL.flatMap((r) => [r.a, r.en].filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'ru'));

// ---------- база ----------
let ready = null;
async function ensure(env) {
  if (ready === env.DB) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS riddle_tries (user_id TEXT NOT NULL, day TEXT NOT NULL, tries TEXT NOT NULL DEFAULT '[]', solved INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))").run();
  ready = env.DB;
}
const parse = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
// сколько дней подряд отгадывал (до сегодня; если сегодня ещё нет — до вчера)
export function streakOf(days, today) {
  const set = new Set(days);
  const back = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') - k * 864e5).toISOString().slice(0, 10);
  let k = set.has(today) ? 0 : 1, n = 0;
  while (set.has(back(today, k))) { n++; k++; }
  return n;
}
function viewOf(day, row, extra) {
  const { n, r } = riddleOf(day);
  const tries = row ? parse(row.tries) : [], solved = !!(row && row.solved), over = !solved && tries.length >= MAX_TRIES;
  const all = hintsOf(r), wrong = tries.length - (solved ? 1 : 0);
  const done = solved || over;
  return { day, n, max: MAX_TRIES, tries, solved, over, hints: done ? all : all.slice(0, Math.min(all.length, 1 + wrong)), total: all.length, answer: done ? r.a + (r.en && r.en !== r.a ? ` (${r.en})` : '') : null, ...extra };
}
async function stateOf(env, me, now) {
  await ensure(env);
  const day = dayKey(now, RIDDLE_TZ);
  const [row, past, friends] = await env.DB.batch([
    env.DB.prepare('SELECT tries, solved FROM riddle_tries WHERE user_id = ? AND day = ?').bind(me.id, day),
    env.DB.prepare('SELECT day FROM riddle_tries WHERE user_id = ? AND solved = 1 ORDER BY day DESC LIMIT 120').bind(me.id),
    env.DB.prepare(`SELECT u.username AS name, t.tries AS tries, t.solved AS solved FROM friendships f
      JOIN riddle_tries t ON t.user_id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AND t.day = ?2
      JOIN users u ON u.id = t.user_id WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted' LIMIT 50`).bind(me.id, day),
  ]);
  const r = row.results && row.results[0];
  const fr = (friends.results || []).map((x) => { const t = parse(x.tries); const s = !!x.solved; return { name: x.name, tries: t.length, solved: s, over: !s && t.length >= MAX_TRIES }; })
    .filter((x) => x.solved || x.over).sort((a, b) => (b.solved - a.solved) || (a.tries - b.tries));
  return viewOf(day, r, { streak: streakOf((past.results || []).map((x) => x.day), day), friends: fr });
}

export function makeRiddleRoutes(h) {
  const { json, fail } = h;
  return {
    // сегодняшняя загадка: открытые подсказки, свои попытки, серия, кто из друзей уже отгадал
    async 'GET /riddle'({ env, me }) { return json(await stateOf(env, me, Date.now())); },
    // все названия — подсказки при вводе (ответ среди них, но какой — не видно)
    async 'GET /riddle/names'() { return json({ names: NAMES }); },
    // { g } — попытка
    async 'POST /riddle/guess'({ env, request, me }) {
      if (h.burst && h.burst('riddle:' + me.id, 20, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const g = String((b && b.g) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!norm(g)) return fail(400, 'Напиши ответ.');
      await ensure(env);
      const now = Date.now(), day = dayKey(now, RIDDLE_TZ);
      const cur = await env.DB.prepare('SELECT tries, solved FROM riddle_tries WHERE user_id = ? AND day = ?').bind(me.id, day).first();
      const tries = cur ? parse(cur.tries) : [];
      if ((cur && cur.solved) || tries.length >= MAX_TRIES) return json({ ...(await stateOf(env, me, now)), ok: !!(cur && cur.solved) });
      if (tries.some((t) => norm(t) === norm(g))) return fail(400, 'Этот ответ уже был.');
      const ok = isRight(riddleOf(day).r, g);
      tries.push(g);
      await env.DB.prepare('INSERT INTO riddle_tries (user_id, day, tries, solved, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET tries = excluded.tries, solved = excluded.solved, at = excluded.at')
        .bind(me.id, day, JSON.stringify(tries), ok ? 1 : 0, now).run();
      if (ok && h.lvGive) { try { await h.lvGive(env, request, me, me.id, [{ kind: 'riddle', ref: day }]); } catch (e) { console.error('riddle xp', e && e.message); } }
      return json({ ...(await stateOf(env, me, now)), ok });
    },
  };
}
