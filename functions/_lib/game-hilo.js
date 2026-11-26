// Казуал Хаб: мини-игра «Выше или ниже» (страница games/hilo/, опыт — правила hilo и hilo_streak в levels.js).
// Две карточки — игра, аниме или фильм. У первой балл открыт: выше или ниже он у второй? Угадал — вторая становится
// первой и приходит новая, ошибся — забег окончен. Счёт — серия верных ответов подряд.
// Баллы — от 0 до 10 с одной цифрой после запятой (внутри — целые десятые, поле v): у игр — доля положительных отзывов
// Steam (IStoreBrowseService/GetItems, без ключа, пачкой по CHUNK кодов), у аниме — средний балл AniList (тоже пачкой),
// у фильмов — рейтинг IMDb через OMDb, только с ключом OMDB_KEY (imdbLookup из imdb.js с его таблицей imdb_info).
// Ответы Steam и AniList лежат в Cache API кусками списка и в памяти Worker'а 10 минут: на ход уходит один-два подзапроса.
// Без балла, без обложки и с малым числом отзывов карточка пропускается; пары с одинаковым баллом не бывает.
// Против подглядывания (так просил владелец сайта): у хода срок ROUND_MS с выдачи, ответ позже — проигрыш; страница,
// потеряв фокус или видимость, шлёт POST /games/hilo/lose (при уходе со страницы — sendBeacon, без входа: хватает кода
// забега), и забег окончен; балл второй карточки уходит на страницу только после ответа.
// Гости играют без входа (адреса — HILO_PUBLIC), но без рекордов и опыта. Забег — строка hilo_runs (через пару дней
// удаляется), рекорды вошедших — hilo_best: лучшая серия за всё время и за день по Киеву, сколько верных ответов сегодня
// (опыт за ответ — только за первые RULES.hilo.day в день: дальше сервер его и не спрашивает, журнал не пухнет).
import { dayKey, RULES, levelsMode } from './levels.js';
import { imdbLookup } from './imdb.js';

export const HILO_TZ = 'Europe/Kiev';
export const ROUND_MS = 15000; // на ответ
export const REVEAL_MS = 1500; // после верного ответа страница показывает балл, потом новую пару: столько же добавляется к сроку
export const GRACE_MS = 1500; // запас на дорогу запроса
export const STREAK_BONUS = 10; // серия, за которую раз в день — опыт hilo_streak
// адреса без входа (гости тоже играют); подключаются к PUBLIC в API
export const HILO_PUBLIC = ['GET /games/hilo', 'POST /games/hilo/start', 'POST /games/hilo/answer', 'POST /games/hilo/lose'];
const RUN_RE = /^[0-9a-f]{32}$/;
const GUEST_RE = /^[a-z0-9]{12,40}$/; // как в presence.js (casualhub.guestId.v1 на странице)
const CHUNK = 40; // кусок списка: один подзапрос к источнику и одна запись в кэше
const TTL = 3 * 86400; // ответ источника в Cache API, с
const MEM_MS = 600e3; // и в памяти Worker'а
const MIN = { g: 2000, a: 20000, m: 25000 }; // меньше отзывов (Steam), зрителей (AniList) или голосов (IMDb) — не берём
const UA = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: 'application/json' };
const STEAM_ASSET = 'https://shared.akamai.steamstatic.com/store_item_assets/';
export const KIND = { g: 'game', a: 'anime', m: 'movie' };
export const SRC = { g: 'Steam', a: 'AniList', m: 'IMDb' };

// ---------- что угадываем ----------
// игры — коды Steam (название и обложка — из Steam)
export const GAMES = [
  10, 70, 220, 240, 400, 440, 550, 570, 620, 730, 4000, 8930, 289070, 105600, 413150, 367520, 391540, 1145360, 1145350, 292030,
  20920, 1091500, 489830, 377160, 22380, 22300, 1086940, 1245620, 374320, 570940, 814380, 271590, 12210, 1174180, 252490, 346110,
  218620, 359550, 578080, 1172470, 230410, 1085660, 892970, 322330, 219740, 261550, 48700, 255710, 294100, 427520, 526870, 281990,
  394360, 1158310, 1222670, 227300, 1551360, 1293830, 252950, 381210, 739630, 945360, 1097150, 632360, 250900, 588650, 268910, 504230,
  646570, 1794680, 311690, 1966720, 582010, 883710, 952060, 1196590, 2050650, 418370, 601150, 1888930, 1593500, 2322010, 1151640, 2420110,
  1817070, 1659420, 1850570, 990080, 1716740, 1771300, 379430, 2358720, 553850, 1142710, 594570, 813780, 1466860, 238320, 282140, 214490,
  8870, 7670, 1328670, 24960, 1222140, 524220, 1687950, 2161700, 1150690, 753640, 1426210, 1172620, 1057090, 261570, 976730, 1325200,
  1384160, 1364780, 1778820, 976310, 1971870, 1599340, 367500, 2054970, 1774580, 1172380, 208650, 200260, 35140, 239140, 534380, 1144200,
  1332010, 2379780, 1092790, 1868140, 1623730, 1817230, 1903340, 2183900, 2694490, 2357570, 2767030, 1888160, 1462040, 39210, 2515020, 1113000,
  894020, 1238860, 1238810, 1517290, 2807960, 1693980, 17470, 47780, 2215430, 1895880, 1235140, 638970, 2072450, 812140, 582160, 2208920,
  242050, 552520, 298110, 220240, 2369390, 243470, 447040, 1846380, 244850, 306130, 1284210, 211820, 233860, 1627720, 2622380, 1222690,
  47810, 1659040, 108600, 1203220,
];
// аниме — код AniList и русское название (по-английски и по-украински показываем название из AniList)
export const ANIME = [
  [1535, 'Тетрадь смерти'], [16498, 'Атака титанов'], [5114, 'Стальной алхимик: Братство'], [20, 'Наруто'], [1735, 'Наруто: Ураганные хроники'],
  [21, 'Ван-Пис'], [269, 'Блич'], [813, 'Жемчуг дракона Z'], [223, 'Жемчуг дракона'], [1, 'Ковбой Бибоп'], [30, 'Евангелион'],
  [32, 'Конец Евангелиона'], [199, 'Унесённые призраками'], [523, 'Мой сосед Тоторо'], [164, 'Принцесса Мононоке'], [431, 'Ходячий замок'],
  [512, 'Ведьмина служба доставки'], [513, 'Небесный замок Лапута'], [572, 'Навсикая из Долины ветров'], [2890, 'Рыбка Поньо на утёсе'],
  [16662, 'Ветер крепчает'], [578, 'Могила светлячков'], [47, 'Акира'], [43, 'Призрак в доспехах'], [437, 'Идеальная грусть'], [1943, 'Паприка'],
  [21519, 'Твоё имя'], [20954, 'Форма голоса'], [106286, 'Дитя погоды'], [142770, 'Судзумэ, закрывающая двери'], [1689, '5 сантиметров в секунду'],
  [2236, 'Девочка, покорившая время'], [12355, 'Волчьи дети Амэ и Юки'], [21087, 'Ванпанчмен'], [21507, 'Моб Психо 100'], [113415, 'Магическая битва'],
  [127230, 'Человек-бензопила'], [101922, 'Клинок, рассекающий демонов'], [21459, 'Моя геройская академия'], [20605, 'Токийский гуль'],
  [11061, 'Охотник х Охотник'], [9253, 'Врата Штейна'], [1575, 'Код Гиас: Восставший Лелуш'], [2904, 'Код Гиас: Восставший Лелуш R2'],
  [11757, 'Мастера меча онлайн'], [6547, 'Ангельские ритмы!'], [4224, 'Торадора!'], [4181, 'Кланнад: Продолжение истории'], [2001, 'Гуррен-Лаганн'],
  [10087, 'Судьба: Начало'], [13601, 'Психопаспорт'], [14719, 'Невероятные приключения ДжоДжо'], [20464, 'Волейбол!!'], [11771, 'Баскетбол Куроко'],
  [20665, 'Твоя апрельская ложь'], [9989, 'Невиданный цветок'], [21827, 'Вайолет Эвергарден'], [97986, 'Созданный в Бездне'],
  [21355, 'Re:Zero. Жизнь с нуля в альтернативном мире'], [21202, 'Этот замечательный мир!'], [19815, 'Нет игры — нет жизни'], [20832, 'Повелитель'],
  [101280, 'О моём перерождении в слизь'], [99263, 'Восхождение героя щита'], [108465, 'Реинкарнация безработного'], [140960, 'Семья шпиона'],
  [154587, 'Провожающая в последний путь Фрирен'], [150672, 'Звёздное дитя'], [130003, 'Одинокий рокер!'], [120377, 'Киберпанк: Бегущие по краю'],
  [101348, 'Сага о Винланде'], [105333, 'Доктор Стоун'], [101759, 'Обещанный Неверленд'], [101921, 'Госпожа Кагуя: В любви как на войне'],
  [124080, 'Хоримия'], [105334, 'Корзинка фруктов'], [853, 'Хост-клуб Оранской школы'], [3588, 'Пожиратель душ'], [6702, 'Хвост Феи'],
  [97940, 'Чёрный клевер'], [9919, 'Синий экзорцист'], [20623, 'Паразит: Учение о жизни'], [21234, 'Город, в котором меня нет'],
  [20931, 'Парад смерти'], [20447, 'Бездомный бог'], [18679, 'Убить или быть убитым'], [6746, 'Дюрарара!!'], [2251, 'Баккано!'], [19, 'Монстр'],
  [33, 'Берсерк'], [777, 'Хеллсинг: Война с нечистью'], [205, 'Самурай Чамплу'], [6, 'Триган'], [245, 'Крутой учитель Онидзука'], [457, 'Мастер муси'],
  [4081, 'Тетрадь дружбы Нацумэ'], [5680, 'Кэйон!'], [849, 'Меланхолия Харухи Судзумии'], [2025, 'Темнее чёрного'], [226, 'Эльфийская песнь'],
  [934, 'Когда плачут цикады'], [11111, 'Иная'], [10620, 'Дневник будущего'], [120120, 'Токийские мстители'], [105310, 'Пламенная бригада пожарных'],
  [21311, 'Великий из бродячих псов'], [20755, 'Класс убийц'], [20923, 'Повар-боец Сома'], [99699, 'Золотое божество'], [105228, 'Дорохэдоро'],
  [128893, 'Адский рай'], [137822, 'Синяя тюрьма'], [151807, 'Поднятие уровня в одиночку'], [153288, 'Кайдзю номер восемь'], [171018, 'Дандадан'],
  [153518, 'Подземелье вкусностей'], [530, 'Сейлор Мун'], [527, 'Покемон'], [552, 'Приключения дигимонов'], [235, 'Детектив Конан'],
  [392, 'Отчёт о буйстве духов'], [45, 'Бродяга Кэнсин'], [249, 'Инуяся'], [918, 'Гинтама'], [21366, 'Мартовский лев'], [12189, 'Хёка'],
  [877, 'Нана'], [790, 'Эрго Прокси'], [339, 'Эксперименты Лэйн'], [121, 'Стальной алхимик'], [112151, 'Клинок, рассекающий демонов: Бесконечный поезд'],
  [131573, 'Магическая битва 0'], [99750, 'Хочу съесть твою поджелудочную'], [109979, 'Мальчик и птица'], [153152, 'Опасность в моём сердце'],
  [161645, 'Монолог фармацевта'], [143270, 'Ликорис Рекоил'], [116674, 'Блич: Тысячелетняя кровавая война'], [263, 'Первый шаг'], [170, 'Слэм-данк'],
];
// фильмы — код IMDb, название, русское название, год (OMDb отдаёт только рейтинг и постер). Только с ключом OMDB_KEY
export const MOVIES = [
  ['tt0111161', 'The Shawshank Redemption', 'Побег из Шоушенка', 1994], ['tt0068646', 'The Godfather', 'Крёстный отец', 1972],
  ['tt0071562', 'The Godfather Part II', 'Крёстный отец 2', 1974], ['tt0468569', 'The Dark Knight', 'Тёмный рыцарь', 2008],
  ['tt0110912', 'Pulp Fiction', 'Криминальное чтиво', 1994], ['tt0137523', 'Fight Club', 'Бойцовский клуб', 1999],
  ['tt1375666', 'Inception', 'Начало', 2010], ['tt0816692', 'Interstellar', 'Интерстеллар', 2014], ['tt0133093', 'The Matrix', 'Матрица', 1999],
  ['tt0109830', 'Forrest Gump', 'Форрест Гамп', 1994], ['tt0120737', 'The Lord of the Rings: The Fellowship of the Ring', 'Властелин колец: Братство Кольца', 2001],
  ['tt0167261', 'The Lord of the Rings: The Two Towers', 'Властелин колец: Две крепости', 2002],
  ['tt0167260', 'The Lord of the Rings: The Return of the King', 'Властелин колец: Возвращение короля', 2003],
  ['tt0076759', 'Star Wars: A New Hope', 'Звёздные войны. Эпизод IV: Новая надежда', 1977],
  ['tt0080684', 'The Empire Strikes Back', 'Звёздные войны. Эпизод V: Империя наносит ответный удар', 1980],
  ['tt0086190', 'Return of the Jedi', 'Звёздные войны. Эпизод VI: Возвращение джедая', 1983],
  ['tt0120915', 'Star Wars: Episode I – The Phantom Menace', 'Звёздные войны. Эпизод I: Скрытая угроза', 1999],
  ['tt0121766', 'Star Wars: Episode III – Revenge of the Sith', 'Звёздные войны. Эпизод III: Месть ситхов', 2005],
  ['tt2488496', 'Star Wars: The Force Awakens', 'Звёздные войны: Пробуждение силы', 2015], ['tt0088763', 'Back to the Future', 'Назад в будущее', 1985],
  ['tt0114369', 'Se7en', 'Семь', 1995], ['tt0102926', 'The Silence of the Lambs', 'Молчание ягнят', 1991],
  ['tt0120815', 'Saving Private Ryan', 'Спасти рядового Райана', 1998], ['tt0108052', "Schindler's List", 'Список Шиндлера', 1993],
  ['tt0120338', 'Titanic', 'Титаник', 1997], ['tt0499549', 'Avatar', 'Аватар', 2009], ['tt0848228', 'The Avengers', 'Мстители', 2012],
  ['tt4154756', 'Avengers: Infinity War', 'Мстители: Война бесконечности', 2018], ['tt4154796', 'Avengers: Endgame', 'Мстители: Финал', 2019],
  ['tt0372784', 'Batman Begins', 'Бэтмен: Начало', 2005], ['tt1345836', 'The Dark Knight Rises', 'Тёмный рыцарь: Возрождение легенды', 2012],
  ['tt0172495', 'Gladiator', 'Гладиатор', 2000], ['tt0407887', 'The Departed', 'Отступники', 2006], ['tt0482571', 'The Prestige', 'Престиж', 2006],
  ['tt0209144', 'Memento', 'Помни', 2000], ['tt1853728', 'Django Unchained', 'Джанго освобождённый', 2012],
  ['tt0361748', 'Inglourious Basterds', 'Бесславные ублюдки', 2009], ['tt0110357', 'The Lion King', 'Король Лев', 1994], ['tt0126029', 'Shrek', 'Шрек', 2001],
  ['tt0298148', 'Shrek 2', 'Шрек 2', 2004], ['tt0114709', 'Toy Story', 'История игрушек', 1995], ['tt0435761', 'Toy Story 3', 'История игрушек: Большой побег', 2010],
  ['tt0910970', 'WALL·E', 'ВАЛЛ·И', 2008], ['tt1049413', 'Up', 'Вверх', 2009], ['tt2096673', 'Inside Out', 'Головоломка', 2015],
  ['tt0266543', 'Finding Nemo', 'В поисках Немо', 2003], ['tt0382932', 'Ratatouille', 'Рататуй', 2007], ['tt0198781', 'Monsters, Inc.', 'Корпорация монстров', 2001],
  ['tt0317705', 'The Incredibles', 'Суперсемейка', 2004], ['tt2380307', 'Coco', 'Тайна Коко', 2017], ['tt0892769', 'How to Train Your Dragon', 'Как приручить дракона', 2010],
  ['tt0441773', 'Kung Fu Panda', 'Кунг-фу панда', 2008], ['tt1323594', 'Despicable Me', 'Гадкий я', 2010], ['tt2294629', 'Frozen', 'Холодное сердце', 2013],
  ['tt0268380', 'Ice Age', 'Ледниковый период', 2002], ['tt0351283', 'Madagascar', 'Мадагаскар', 2005], ['tt0103639', 'Aladdin', 'Аладдин', 1992],
  ['tt2245084', 'Big Hero 6', 'Город героев', 2014], ['tt1160419', 'Dune', 'Дюна', 2021], ['tt15239678', 'Dune: Part Two', 'Дюна: Часть вторая', 2024],
  ['tt15398776', 'Oppenheimer', 'Оппенгеймер', 2023], ['tt1517268', 'Barbie', 'Барби', 2023], ['tt0993846', 'The Wolf of Wall Street', 'Волк с Уолл-стрит', 2013],
  ['tt0338013', 'Eternal Sunshine of the Spotless Mind', 'Вечное сияние чистого разума', 2004], ['tt0434409', 'V for Vendetta', 'V — значит вендетта', 2005],
  ['tt0325980', 'Pirates of the Caribbean: The Curse of the Black Pearl', 'Пираты Карибского моря: Проклятие Чёрной жемчужины', 2003],
  ['tt0241527', "Harry Potter and the Sorcerer's Stone", 'Гарри Поттер и философский камень', 2001],
  ['tt0304141', 'Harry Potter and the Prisoner of Azkaban', 'Гарри Поттер и узник Азкабана', 2004],
  ['tt1201607', 'Harry Potter and the Deathly Hallows: Part 2', 'Гарри Поттер и Дары Смерти. Часть 2', 2011],
  ['tt0107290', 'Jurassic Park', 'Парк юрского периода', 1993], ['tt0083658', 'Blade Runner', 'Бегущий по лезвию', 1982],
  ['tt1856101', 'Blade Runner 2049', 'Бегущий по лезвию 2049', 2017], ['tt0078748', 'Alien', 'Чужой', 1979], ['tt0090605', 'Aliens', 'Чужие', 1986],
  ['tt0103064', 'Terminator 2: Judgment Day', 'Терминатор 2: Судный день', 1991], ['tt0088247', 'The Terminator', 'Терминатор', 1984],
  ['tt0081505', 'The Shining', 'Сияние', 1980], ['tt0073486', "One Flew Over the Cuckoo's Nest", 'Пролетая над гнездом кукушки', 1975],
  ['tt0099685', 'Goodfellas', 'Славные парни', 1990], ['tt0075314', 'Taxi Driver', 'Таксист', 1976], ['tt0105236', 'Reservoir Dogs', 'Бешеные псы', 1992],
  ['tt0266697', 'Kill Bill: Vol. 1', 'Убить Билла', 2003], ['tt0119217', 'Good Will Hunting', 'Умница Уилл Хантинг', 1997],
  ['tt0120689', 'The Green Mile', 'Зелёная миля', 1999], ['tt0253474', 'The Pianist', 'Пианист', 2002], ['tt0317248', 'City of God', 'Город Бога', 2002],
  ['tt0364569', 'Oldboy', 'Олдбой', 2003], ['tt6751668', 'Parasite', 'Паразиты', 2019], ['tt0118799', 'Life Is Beautiful', 'Жизнь прекрасна', 1997],
  ['tt0211915', 'Amélie', 'Амели', 2001], ['tt0050083', '12 Angry Men', '12 разгневанных мужчин', 1957],
  ['tt0060196', 'The Good, the Bad and the Ugly', 'Хороший, плохой, злой', 1966], ['tt0047478', 'Seven Samurai', 'Семь самураев', 1954],
  ['tt0034583', 'Casablanca', 'Касабланка', 1942], ['tt0167404', 'The Sixth Sense', 'Шестое чувство', 1999], ['tt0144084', 'American Psycho', 'Американский психопат', 2000],
  ['tt0180093', 'Requiem for a Dream', 'Реквием по мечте', 2000], ['tt0477348', 'No Country for Old Men', 'Старикам тут не место', 2007],
  ['tt1130884', 'Shutter Island', 'Остров проклятых', 2010], ['tt2582802', 'Whiplash', 'Одержимость', 2014], ['tt2015381', 'Guardians of the Galaxy', 'Стражи Галактики', 2014],
  ['tt0371746', 'Iron Man', 'Железный человек', 2008], ['tt10872600', 'Spider-Man: No Way Home', 'Человек-паук: Нет пути домой', 2021],
  ['tt4633694', 'Spider-Man: Into the Spider-Verse', 'Человек-паук: Через вселенные', 2018],
  ['tt9362722', 'Spider-Man: Across the Spider-Verse', 'Человек-паук: Паутина вселенных', 2023], ['tt0145487', 'Spider-Man', 'Человек-паук', 2002],
  ['tt7286456', 'Joker', 'Джокер', 2019], ['tt1392190', 'Mad Max: Fury Road', 'Безумный Макс: Дорога ярости', 2015],
  ['tt2084970', 'The Imitation Game', 'Игра в имитацию', 2014], ['tt0947798', 'Black Swan', 'Чёрный лебедь', 2010], ['tt1285016', 'The Social Network', 'Социальная сеть', 2010],
  ['tt3783958', 'La La Land', 'Ла-Ла Ленд', 2016], ['tt5013056', 'Dunkirk', 'Дюнкерк', 2017], ['tt6710474', 'Everything Everywhere All at Once', 'Всё везде и сразу', 2022],
  ['tt1877830', 'The Batman', 'Бэтмен', 2022], ['tt0120382', 'The Truman Show', 'Шоу Трумана', 1998], ['tt0112573', 'Braveheart', 'Храброе сердце', 1995],
  ['tt0095016', 'Die Hard', 'Крепкий орешек', 1988], ['tt0093058', 'Full Metal Jacket', 'Цельнометаллическая оболочка', 1987],
  ['tt0078788', 'Apocalypse Now', 'Апокалипсис сегодня', 1979], ['tt0082971', 'Raiders of the Lost Ark', 'Индиана Джонс: В поисках утраченного ковчега', 1981],
  ['tt0062622', '2001: A Space Odyssey', 'Космическая одиссея 2001 года', 1968], ['tt0066921', 'A Clockwork Orange', 'Заводной апельсин', 1971],
  ['tt0114814', 'The Usual Suspects', 'Подозрительные лица', 1995], ['tt0116282', 'Fargo', 'Фарго', 1996], ['tt0118715', 'The Big Lebowski', 'Большой Лебовски', 1998],
  ['tt0120586', 'American History X', 'Американская история Икс', 1998], ['tt0457430', "Pan's Labyrinth", 'Лабиринт фавна', 2006],
  ['tt0110413', 'Léon: The Professional', 'Леон', 1994], ['tt0099785', 'Home Alone', 'Один дома', 1990], ['tt0107048', 'Groundhog Day', 'День сурка', 1993],
  ['tt0119654', 'Men in Black', 'Люди в чёрном', 1997], ['tt0208092', 'Snatch', 'Большой куш', 2000],
  ['tt0120735', 'Lock, Stock and Two Smoking Barrels', 'Карты, деньги, два ствола', 1998], ['tt8946378', 'Knives Out', 'Достать ножи', 2019],
  ['tt1119646', 'The Hangover', 'Мальчишник в Вегасе', 2009], ['tt1431045', 'Deadpool', 'Дэдпул', 2016], ['tt3315342', 'Logan', 'Логан', 2017],
  ['tt0416449', '300', '300 спартанцев', 2006], ['tt1631867', 'Edge of Tomorrow', 'Грань будущего', 2014], ['tt0369610', 'Jurassic World', 'Мир юрского периода', 2015],
  ['tt0114746', 'Twelve Monkeys', '12 обезьян', 1995], ['tt0113277', 'Heat', 'Схватка', 1995], ['tt1745960', 'Top Gun: Maverick', 'Топ Ган: Мэверик', 2022],
  ['tt0073195', 'Jaws', 'Челюсти', 1975], ['tt0083866', 'E.T. the Extra-Terrestrial', 'Инопланетянин', 1982], ['tt0084787', 'The Thing', 'Нечто', 1982],
  ['tt0070047', 'The Exorcist', 'Изгоняющий дьявола', 1973], ['tt5052448', 'Get Out', 'Прочь', 2017], ['tt1396484', 'It', 'Оно', 2017],
  ['tt0054215', 'Psycho', 'Психо', 1960], ['tt0079944', 'Stalker', 'Сталкер', 1979], ['tt0069293', 'Solaris', 'Солярис', 1972],
  ['tt0086250', 'Scarface', 'Лицо со шрамом', 1983], ['tt0119116', 'The Fifth Element', 'Пятый элемент', 1997], ['tt0110475', 'The Mask', 'Маска', 1994],
  ['tt0162222', 'Cast Away', 'Изгой', 2000], ['tt0264464', 'Catch Me If You Can', 'Поймай меня, если сможешь', 2002],
  ['tt0268978', 'A Beautiful Mind', 'Игры разума', 2001], ['tt0289879', 'The Butterfly Effect', 'Эффект бабочки', 2004],
  ['tt0367594', 'Charlie and the Chocolate Factory', 'Чарли и шоколадная фабрика', 2005], ['tt0381061', 'Casino Royale', 'Казино «Рояль»', 2006],
  ['tt0454921', 'The Pursuit of Happyness', 'В погоне за счастьем', 2006], ['tt0480249', 'I Am Legend', 'Я — легенда', 2007],
  ['tt0903624', 'The Hobbit: An Unexpected Journey', 'Хоббит: Нежданное путешествие', 2012], ['tt1010048', 'Slumdog Millionaire', 'Миллионер из трущоб', 2008],
  ['tt1675434', 'The Intouchables', '1+1', 2011], ['tt1028532', "Hachi: A Dog's Tale", 'Хатико: Самый верный друг', 2009], ['tt1187043', '3 Idiots', 'Три идиота', 2009],
  ['tt1205489', 'Gran Torino', 'Гран Торино', 2008], ['tt2278388', 'The Grand Budapest Hotel', 'Отель «Гранд Будапешт»', 2014], ['tt2543164', 'Arrival', 'Прибытие', 2016],
  ['tt2911666', 'John Wick', 'Джон Уик', 2014], ['tt3659388', 'The Martian', 'Марсианин', 2015], ['tt1663202', 'The Revenant', 'Выживший', 2015],
  ['tt1454468', 'Gravity', 'Гравитация', 2013], ['tt1392214', 'Prisoners', 'Пленницы', 2013], ['tt2802144', 'Kingsman: The Secret Service', 'Kingsman: Секретная служба', 2014],
  ['tt8579674', '1917', '1917', 2019], ['tt1950186', 'Ford v Ferrari', 'Ford против Ferrari', 2019], ['tt7131622', 'Once Upon a Time in Hollywood', 'Однажды в Голливуде', 2019],
  ['tt0087843', 'Once Upon a Time in America', 'Однажды в Америке', 1984], ['tt0057012', 'Dr. Strangelove', 'Доктор Стрейнджлав', 1964],
  ['tt0209163', 'The Mummy Returns', 'Мумия возвращается', 2001], ['tt0343818', 'I, Robot', 'Я, робот', 2004], ['tt0418279', 'Transformers', 'Трансформеры', 2007],
  ['tt0246578', 'Donnie Darko', 'Донни Дарко', 2001], ['tt0988045', 'Sherlock Holmes', 'Шерлок Холмс', 2009], ['tt1670345', 'Now You See Me', 'Иллюзия обмана', 2013],
];
const ANIME_RU = new Map(ANIME);
const MOVIE_OF = new Map(MOVIES.map((m) => [m[0], m]));
const KEYS = { g: GAMES.map((id) => 'g:' + id), a: ANIME.map((x) => 'a:' + x[0]), m: MOVIES.map((x) => 'm:' + x[0]) };
// какие источники включены: фильмы — только с ключом OMDb
export const sourcesOf = (env) => (env && env.OMDB_KEY ? ['g', 'a', 'm'] : ['g', 'a']);

// ---------- баллы из источников ----------
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>()\\]{8,600}$/.test(u) ? u : '');
// «DARK SOULS™ III», «Civilization® VI»: знаки марки в названии не нужны
const cleanName = (s) => clip(String(s || '').replace(/[™®©℠]/g, ''), 140);
// ответ GetItems → { 'g:<код>': { k, t, img, y, v } }: v — доля положительных отзывов в процентах (= десятые балла)
export function steamItems(d) {
  const out = {};
  for (const it of (d && d.response && d.response.store_items) || []) {
    const rv = it && it.reviews && it.reviews.summary_filtered;
    if (!it || !Number.isInteger(it.appid) || it.success !== 1 || it.type !== 0 || !rv) continue;
    const v = Math.round(+rv.percent_positive);
    if (!Number.isFinite(v) || v < 0 || v > 100 || !(+rv.review_count >= MIN.g)) continue;
    const a = it.assets || {};
    const file = a.library_capsule || a.header || a.main_capsule; // вертикальная обложка 600×900, у старых игр — шапка
    const img = a.asset_url_format && file ? https(STEAM_ASSET + String(a.asset_url_format).replace('${FILENAME}', file)) : '';
    const t = cleanName(it.name);
    if (!img || !t) continue;
    const rel = it.release ? +(it.release.original_release_date || it.release.steam_release_date) || 0 : 0;
    out['g:' + it.appid] = { k: 'g:' + it.appid, t, img, y: rel ? new Date(rel * 1000).getUTCFullYear() : 0, v, ...(a.library_capsule ? {} : { wide: 1 }) };
  }
  return out;
}
// ответ AniList → { 'a:<код>': { k, t, ru, img, y, v } }: v — средний балл из 100 (= десятые балла)
export function aniItems(d) {
  const out = {};
  for (const m of (d && d.data && d.data.Page && d.data.Page.media) || []) {
    if (!m || !Number.isInteger(m.id) || m.isAdult || !ANIME_RU.has(m.id)) continue;
    const v = Math.round(+m.averageScore);
    if (!Number.isFinite(v) || v <= 0 || v > 100 || !(+m.popularity >= MIN.a)) continue;
    const c = m.coverImage || {};
    const img = https(c.extraLarge) || https(c.large);
    const t = clip((m.title && (m.title.english || m.title.romaji)) || '', 140);
    if (!img || !t) continue;
    out['a:' + m.id] = { k: 'a:' + m.id, t, ru: ANIME_RU.get(m.id), img, y: +m.seasonYear || 0, v };
  }
  return out;
}
const STEAM_URL = (ids) => 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify({
  ids: ids.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true, include_reviews: true, include_release: true },
}));
const AL_Q = 'query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id isAdult averageScore popularity seasonYear title{romaji english} coverImage{extraLarge large}}}}';
async function getJson(url, init) {
  const r = await fetch(url, { ...(init || {}), headers: { ...UA, ...((init && init.headers) || {}) }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('hilo ' + r.status);
  return r.json();
}
const chunkIds = (src, i) => (src === 'g' ? GAMES : ANIME.map((x) => x[0])).slice(i * CHUNK, (i + 1) * CHUNK);
const loaders = {
  g: async (i) => steamItems(await getJson(STEAM_URL(chunkIds('g', i)))),
  a: async (i) => aniItems(await getJson('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: AL_Q, variables: { ids: chunkIds('a', i) } }) })),
};
// кэш: память Worker'а (10 минут) → Cache API (TTL) → источник. Не ответил — помним это минуту, чтобы не долбить его
const MEM = new Map();
export const forgetScores = () => MEM.clear(); // для тестов
async function cached(key, load) {
  const now = Date.now(), m = MEM.get(key);
  if (m && m.until > now) { if (m.err) throw new Error('hilo source down'); return m.v; }
  const box = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const req = box ? new Request('https://hilo-cache.casualhub/' + encodeURIComponent(key)) : null;
  if (box) {
    try { const hit = await box.match(req); if (hit) { const v = await hit.json(); MEM.set(key, { v, until: now + MEM_MS }); return v; } } catch (e) {}
  }
  let v;
  try { v = await load(); } catch (e) { MEM.set(key, { err: true, until: now + 60e3 }); throw e; }
  if (box) { try { await box.put(req, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + TTL } })); } catch (e) {} }
  if (MEM.size > 600) MEM.clear(); // куски списков и фильмы по одному — несколько сотен записей
  MEM.set(key, { v, until: now + MEM_MS });
  return v;
}
// фильмы: imdbLookup сам держит рейтинги в imdb_info (неделю) и спрашивает OMDb не больше 15 раз за вызов
async function movieItems(env, keys) {
  const now = Date.now(), out = {}, ask = [];
  for (const k of keys) {
    const m = MEM.get(k);
    if (m && m.until > now) { if (m.v) out[k] = m.v; } else ask.push(k);
  }
  if (ask.length) {
    const got = await imdbLookup(env, ask.map((k) => ({ k, id: k.slice(2) })));
    for (const k of ask) {
      const r = got[k], m = MOVIE_OF.get(k.slice(2));
      if (r === undefined) continue; // «спроси позже»: OMDb не ответил
      const v = r && Number.isFinite(+r.r) ? Math.round(+r.r * 10) : NaN;
      const img = r ? https(r.p) : '';
      const ok = m && v > 0 && v <= 100 && img && +r.v >= MIN.m;
      const it = ok ? { k, t: m[1], ru: m[2], img, y: m[3], v } : null;
      MEM.set(k, { v: it, until: now + MEM_MS });
      if (it) out[k] = it;
    }
  }
  return out;
}
const rnd = (n) => Math.floor(Math.random() * n);
const MOVIE_TRY = 4; // фильмов за одну попытку: у каждого — запрос к imdb_info, а без свежей записи ещё и к OMDb
// карточки одного источника, из которых выбирать: случайный кусок списка, где ещё есть не показанные (asked — какие из них
// годились бы; got — что ответил источник)
async function candidates(env, src, used, skip) {
  const free = KEYS[src].filter((k) => !used.has(k) && !skip.has(k));
  if (!free.length) return { got: {}, asked: [] };
  if (src === 'm') {
    const asked = [];
    while (asked.length < MOVIE_TRY && free.length) asked.push(free.splice(rnd(free.length), 1)[0]);
    return { got: await movieItems(env, asked), asked };
  }
  const part = (k) => Math.floor(KEYS[src].indexOf(k) / CHUNK);
  const chunks = [...new Set(free.map(part))];
  const i = chunks[rnd(chunks.length)];
  return { got: await cached(`hilo:${src}:${i}:v1`, () => loaders[src](i)), asked: free.filter((k) => part(k) === i) };
}
// следующая карточка: не из уже показанных и не с баллом avoid (балл первой карточки — одинаковых в паре не бывает).
// Источник — по числу ещё не показанных карточек; не ответил — дальше без него, подходящих нет — другой кусок.
// Фильмы — не больше одной попытки (запросы к базе и OMDb). Ответ — карточка, null (ничего не нашлось) или { none: true } —
// показаны уже все карточки
export async function pickItem(env, used, avoid = null, tries = 5) {
  const srcs = sourcesOf(env), skip = new Set(), down = new Set();
  if (!srcs.some((s) => KEYS[s].some((k) => !used.has(k)))) return { none: true };
  const freeOf = (s) => KEYS[s].filter((k) => !used.has(k) && !skip.has(k)).length;
  for (let t = 0; t < tries; t++) {
    const left = srcs.filter((s) => !down.has(s)).map((s) => [s, freeOf(s)]).filter((x) => x[1] > 0);
    if (!left.length) break;
    let r = rnd(left.reduce((a, x) => a + x[1], 0)), src = left[0][0];
    for (const [s, n] of left) { if (r < n) { src = s; break; } r -= n; }
    if (src === 'm') down.add('m');
    let res;
    try { res = await candidates(env, src, used, skip); } catch (e) { down.add(src); continue; }
    const ok = res.asked.map((k) => res.got[k]).filter((x) => x && x.v !== avoid);
    if (ok.length) return ok[rnd(ok.length)];
    res.asked.forEach((k) => skip.add(k));
  }
  return null;
}
// карточка для страницы: балл — только у открытой
export function view(x, open) {
  const s = String(x.k || '').slice(0, 1);
  return { t: x.t, ...(x.ru ? { ru: x.ru } : {}), img: x.img || '', y: x.y || 0, kind: KIND[s] || 'game', src: SRC[s] || '', ...(x.wide ? { wide: 1 } : {}), ...(open ? { s: x.v / 10 } : {}) };
}
// верен ли ответ: «выше» — у второй балл больше, «ниже» — меньше (равных в паре не бывает)
export const isRight = (a, b, pick) => (pick === 'higher' ? b.v > a.v : pick === 'lower' ? b.v < a.v : false);

// ---------- база ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hilo_runs (id TEXT PRIMARY KEY, user_id TEXT, guest TEXT, status TEXT NOT NULL, why TEXT, step INTEGER NOT NULL DEFAULT 0, a TEXT NOT NULL, b TEXT NOT NULL, used TEXT NOT NULL, deadline INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS hilo_runs_user ON hilo_runs(user_id, status)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS hilo_runs_guest ON hilo_runs(guest, status)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS hilo_runs_at ON hilo_runs(updated_at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hilo_best (user_id TEXT PRIMARY KEY, best INTEGER NOT NULL DEFAULT 0, best_run TEXT, best_at INTEGER, day TEXT, day_best INTEGER NOT NULL DEFAULT 0, day_ok INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)'),
  ]);
  ready.add(env.DB);
}
const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
const runId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
// забег окончен: why — wrong (ошибся), time (не успел), left (ушёл со страницы), pool (карточки кончились), error (следующая
// не нашлась). Записывает тот запрос, который первым это заметил
async function finish(env, id, why, now) {
  const w = await env.DB.prepare("UPDATE hilo_runs SET status = 'lost', why = ?, updated_at = ? WHERE id = ? AND status = 'live'").bind(why, now, id).run();
  return !!(w.meta && w.meta.changes);
}
// верный ответ вошедшего: рекорды (за всё время, за день по Киеву) и счётчик верных ответов за день — одной записью
async function bump(env, uid, step, run, now) {
  const day = dayKey(now, HILO_TZ);
  return env.DB.prepare(`INSERT INTO hilo_best (user_id, best, best_run, best_at, day, day_best, day_ok, runs, updated_at) VALUES (?1, ?2, ?5, ?4, ?3, ?2, 1, 1, ?4)
    ON CONFLICT(user_id) DO UPDATE SET best_run = CASE WHEN ?2 > best THEN ?5 ELSE best_run END, best_at = CASE WHEN ?2 > best THEN ?4 ELSE best_at END,
      best = MAX(best, ?2), day_best = CASE WHEN day = ?3 THEN MAX(day_best, ?2) ELSE ?2 END, day_ok = CASE WHEN day = ?3 THEN day_ok + 1 ELSE 1 END,
      day = ?3, updated_at = ?4
    RETURNING day_ok`).bind(uid, step, day, now, run).first();
}
async function myRow(env, uid) { return env.DB.prepare('SELECT best, best_run, day, day_best, runs FROM hilo_best WHERE user_id = ?').bind(uid).first(); }
// свои рекорды и таблица друзей (кто уже играл): лучшая серия за всё время и за сегодня
async function statsOf(env, uid, now) {
  const day = dayKey(now, HILO_TZ);
  const [mine, fr] = await env.DB.batch([
    env.DB.prepare('SELECT b.best, b.day, b.day_best, b.runs, u.username, u.uname FROM hilo_best b JOIN users u ON u.id = b.user_id WHERE b.user_id = ?').bind(uid),
    env.DB.prepare(`SELECT b.user_id AS id, b.best, b.day, b.day_best, u.username, u.uname FROM hilo_best b JOIN users u ON u.id = b.user_id
      WHERE b.user_id IN (SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END FROM friendships f WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted')
        AND b.best > 0 AND (u.banned IS NULL OR u.banned = 0) ORDER BY b.best DESC, b.best_at ASC LIMIT 20`).bind(uid),
  ]);
  const m = (mine.results || [])[0];
  const today = (r) => (r && r.day === day ? +r.day_best || 0 : 0);
  const row = (r, id, me) => ({ id, username: r.username || '', handle: r.uname || '', best: +r.best || 0, today: today(r), ...(me ? { me: true } : {}) });
  const board = (fr.results || []).map((r) => row(r, r.id, false));
  if (m && +m.best > 0) board.push(row(m, uid, true));
  board.sort((x, y) => y.best - x.best || y.today - x.today);
  return { me: { best: m ? +m.best || 0 : 0, today: today(m), runs: m ? +m.runs || 0 : 0 }, friends: board.length > 1 || (board.length && !board[0].me) ? board : [] };
}
// конец забега для страницы: почему, сколько верных подряд, какой балл был у второй карточки, рекорды
async function overOf(env, run, me, now) {
  const b = parse(run.b, {});
  const out = { why: run.why || 'left', streak: +run.step || 0, b: b.k ? view(b, true) : null };
  if (run.user_id && me && me.id === run.user_id) {
    const r = await myRow(env, me.id);
    const day = dayKey(now, HILO_TZ);
    Object.assign(out, { best: r ? +r.best || 0 : 0, today: r && r.day === day ? +r.day_best || 0 : 0, record: !!(r && r.best_run === run.id && +run.step > 0) });
  }
  return out;
}

export function makeHiloRoutes(h) {
  const { json, fail, readBody } = h;
  const slow = (key, max, win) => (h.burst ? h.burst(key, max, win) : 0);
  const busy = () => fail(429, 'Слишком часто. Подожди немного.');
  const ipOf = (request) => (h.clientIp ? h.clientIp(request) : '') || '';
  // кто спрашивает: адреса открыты без входа, поэтому вход проверяем сами; заблокированный играет как гость
  const who = async (env, request) => {
    if (!h.currentUser) return null;
    try { const u = await h.currentUser(env, request); return u && !u.banned ? u : null; } catch (e) { return null; }
  };
  const xpInfo = (env) => (levelsMode(env) === 'all' ? { per: RULES.hilo.xp, day: RULES.hilo.day, bonus: RULES.hilo_streak.xp, at: STREAK_BONUS } : null);
  async function give(env, request, me, items) {
    if (!h.lvGive || !items.length) return 0;
    try { const r = await h.lvGive(env, request, me, me.id, items); return (r && +r.gained) || 0; } catch (e) { console.error('hilo xp', e && e.message); return 0; }
  }
  return {
    // правила, источники и (у вошедших) свои рекорды и таблица друзей
    async 'GET /games/hilo'({ env, request }) {
      await ensure(env);
      const me = await who(env, request);
      const out = { round: ROUND_MS / 1000, srcs: sourcesOf(env).map((s) => SRC[s]), bonus: STREAK_BONUS, xp: xpInfo(env), signed: !!me };
      if (me) Object.assign(out, await statsOf(env, me.id, Date.now()));
      return json(out);
    },
    // новый забег: { guest? } → { run, a (с баллом), b (без), ms, wait }. Прежний незаконченный забег того же человека закрывается
    async 'POST /games/hilo/start'({ env, request }) {
      const ip = ipOf(request);
      const me = await who(env, request);
      if (slow('hilostart:' + (me ? me.id : ip), 30, 60e3) || slow('hilostartip:' + ip, 90, 60e3)) return busy();
      const body = await readBody(request);
      const guest = !me && typeof body.guest === 'string' && GUEST_RE.test(body.guest) ? body.guest : null;
      await ensure(env);
      const now = Date.now();
      const used = new Set();
      const a = await pickItem(env, used, null);
      if (a && a.k) used.add(a.k);
      const b = a && a.k ? await pickItem(env, used, a.v) : null;
      if (!a || !a.k || !b || !b.k) return fail(503, 'Не получилось загрузить баллы. Попробуй через минуту.');
      const id = runId();
      const q = [];
      if (me) q.push(env.DB.prepare("UPDATE hilo_runs SET status = 'lost', why = 'left', updated_at = ? WHERE user_id = ? AND status = 'live'").bind(now, me.id));
      else if (guest) q.push(env.DB.prepare("UPDATE hilo_runs SET status = 'lost', why = 'left', updated_at = ? WHERE guest = ? AND user_id IS NULL AND status = 'live'").bind(now, guest));
      q.push(env.DB.prepare("INSERT INTO hilo_runs (id, user_id, guest, status, why, step, a, b, used, deadline, created_at, updated_at) VALUES (?, ?, ?, 'live', NULL, 0, ?, ?, ?, ?, ?, ?)")
        .bind(id, me ? me.id : null, guest, JSON.stringify(a), JSON.stringify(b), JSON.stringify([a.k, b.k]), now + ROUND_MS, now, now));
      if (me) q.push(env.DB.prepare('INSERT INTO hilo_best (user_id, runs, updated_at) VALUES (?1, 1, ?2) ON CONFLICT(user_id) DO UPDATE SET runs = runs + 1, updated_at = ?2').bind(me.id, now));
      // изредка — уборка: законченные и брошенные забеги старше двух дней (рекорды — в hilo_best)
      if (Math.random() < 0.02) q.push(env.DB.prepare('DELETE FROM hilo_runs WHERE updated_at < ?').bind(now - 2 * 864e5));
      await env.DB.batch(q);
      return json({ run: id, a: view(a, true), b: view(b, false), ms: ROUND_MS, wait: 0, streak: 0, signed: !!me });
    },
    // ответ: { run, pick: 'higher' | 'lower' } → верно — балл второй и новая пара; нет (или позже срока) — { over }
    async 'POST /games/hilo/answer'({ env, request }) {
      const body = await readBody(request);
      const id = typeof body.run === 'string' && RUN_RE.test(body.run) ? body.run : '';
      const pick = body.pick === 'higher' || body.pick === 'lower' ? body.pick : '';
      if (!id || !pick) return fail(400, 'Не тот запрос.');
      if (slow('hiloans:' + ipOf(request), 240, 60e3)) return busy();
      await ensure(env);
      const me = await who(env, request);
      const now = Date.now();
      const run = await env.DB.prepare('SELECT * FROM hilo_runs WHERE id = ?').bind(id).first();
      if (!run) return fail(404, 'Игра не найдена. Начни новую.');
      if (run.user_id && (!me || me.id !== run.user_id)) return fail(403, 'Это не твоя игра.');
      const reread = async () => env.DB.prepare('SELECT * FROM hilo_runs WHERE id = ?').bind(id).first();
      if (run.status !== 'live') return json({ ok: false, over: await overOf(env, run, me, now) });
      const a = parse(run.a, {}), b = parse(run.b, {});
      if (now > +run.deadline + GRACE_MS) {
        await finish(env, id, 'time', now);
        return json({ ok: false, score: b.v / 10, over: await overOf(env, await reread(), me, now) });
      }
      if (!isRight(a, b, pick)) {
        await finish(env, id, 'wrong', now);
        return json({ ok: false, score: b.v / 10, over: await overOf(env, await reread(), me, now) });
      }
      const step = (+run.step || 0) + 1;
      const used = parse(run.used, []);
      const next = await pickItem(env, new Set(used), b.v);
      const end = !next || !next.k;
      const w = end
        ? await env.DB.prepare("UPDATE hilo_runs SET step = ?, status = 'lost', why = ?, a = ?, updated_at = ? WHERE id = ? AND status = 'live' AND step = ?").bind(step, next && next.none ? 'pool' : 'error', JSON.stringify(b), now, id, run.step).run()
        : await env.DB.prepare("UPDATE hilo_runs SET step = ?, a = ?, b = ?, used = ?, deadline = ?, updated_at = ? WHERE id = ? AND status = 'live' AND step = ?")
          .bind(step, JSON.stringify(b), JSON.stringify(next), JSON.stringify([...used, next.k]), now + REVEAL_MS + ROUND_MS, now, id, run.step).run();
      if (!(w.meta && w.meta.changes)) {
        // одновременно пришёл другой ответ или «ушёл со страницы»: отвечаем тем, что получилось
        const cur = await reread();
        if (cur && cur.status !== 'live') return json({ ok: false, over: await overOf(env, cur, me, now) });
        return fail(409, 'Этот ход уже засчитан.');
      }
      let xp = 0;
      if (run.user_id && me) {
        const rec = await bump(env, me.id, step, id, now);
        const items = [];
        if (rec && +rec.day_ok <= RULES.hilo.day) items.push({ kind: 'hilo', ref: `${id}:${step}` });
        if (step === STREAK_BONUS) items.push({ kind: 'hilo_streak', ref: dayKey(now, HILO_TZ) });
        xp = await give(env, request, me, items);
      }
      if (end) return json({ ok: true, score: b.v / 10, streak: step, xp, over: await overOf(env, await reread(), me, now) });
      return json({ ok: true, score: b.v / 10, streak: step, xp, a: view(b, true), b: view(next, false), ms: ROUND_MS, wait: REVEAL_MS });
    },
    // страница потеряла фокус или видимость, вышло время на странице: { run, why? } → { over }. Без входа: страница
    // шлёт это и sendBeacon при уходе, а у него нет заголовка входа — хватает кода забега, который знает только эта страница
    async 'POST /games/hilo/lose'({ env, request }) {
      const body = await readBody(request);
      const id = typeof body.run === 'string' && RUN_RE.test(body.run) ? body.run : '';
      if (!id) return fail(400, 'Не тот запрос.');
      if (slow('hilolose:' + ipOf(request), 240, 60e3)) return busy();
      await ensure(env);
      const now = Date.now();
      const run = await env.DB.prepare('SELECT * FROM hilo_runs WHERE id = ?').bind(id).first();
      if (!run) return fail(404, 'Игра не найдена. Начни новую.');
      if (run.status === 'live') await finish(env, id, body.why === 'time' || now > +run.deadline + GRACE_MS ? 'time' : 'left', now);
      const me = await who(env, request);
      const cur = await env.DB.prepare('SELECT * FROM hilo_runs WHERE id = ?').bind(id).first();
      return json({ ok: false, over: await overOf(env, cur, me, now) });
    },
  };
}
