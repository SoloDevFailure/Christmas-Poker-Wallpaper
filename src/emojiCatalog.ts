export type Emoji = { unicode: string; name: string; keywords: string; category: string };
// Offline native emoji catalogue. Names and aliases are searchable;
// Unicode sequences stay whole when handed to the existing PNG renderer.
const groups: Record<string, string> = {
  'Smileys': `😀|grinning face|happy smile
😃|smiley face|happy
😄|smiling face|happy laugh
😁|beaming face|grin teeth
😆|laughing face|lol
😅|sweat smile|relief
🤣|rolling on the floor laughing|rofl lol
😂|tears of joy|laugh cry lol
🙂|slightly smiling face|happy
🙃|upside down face|sarcastic
😉|winking face|wink
😊|blushing face|smile happy
😇|angel face|halo innocent
🥰|smiling face with hearts|love
😍|heart eyes|love
🤩|star struck|excited
😘|blowing a kiss|love
😋|yummy face|delicious tongue
😛|tongue out|silly
😜|winking tongue|silly
🤪|zany face|crazy
🤑|money mouth|rich
🤗|hugging face|hug
🤭|hand over mouth|oops
🤫|shushing face|quiet
🤔|thinking face|hmm
🤐|zipper mouth|secret
🤨|raised eyebrow|suspicious
😐|neutral face|meh
😑|expressionless face|blank
😏|smirking face|smug
😒|unamused face|bored
🙄|rolling eyes|annoyed
😬|grimacing face|awkward
🤥|lying face|pinocchio
😌|relieved face|calm
😔|pensive face|sad
😪|sleepy face|tired
🤤|drooling face|hungry
😴|sleeping face|zzz
😷|face with mask|sick
🤒|thermometer face|sick
🤢|nauseated face|sick green
🤮|vomiting face|spew sick
🥵|hot face|sweat
🥶|cold face|freezing
🥴|woozy face|drunk
😵|dizzy face|dead
🤯|exploding head|mind blown
🤠|cowboy face|hat
🥳|partying face|party birthday
😎|sunglasses face|cool
🤓|nerd face|glasses
🧐|monocle face|fancy
😕|confused face|unsure
😟|worried face|anxious
🙁|frowning face|sad
😮|open mouth|surprise
😲|astonished face|shock
😳|flushed face|embarrassed
🥺|pleading face|please
😢|crying face|sad tear
😭|loudly crying face|sob
😱|screaming face|fear horror
😖|confounded face|upset
😞|disappointed face|sad
😤|steam from nose|triumph angry
😡|angry face|rage mad
🤬|swearing face|curse angry
😈|smiling devil|horns evil
👿|angry devil|horns evil
💀|skull|dead death
☠️|skull and crossbones|pirate danger
💩|pile of poo|poop shit
🤡|clown face|joker
👹|ogre|monster
👻|ghost|spooky halloween
👽|alien|space
🤖|robot|machine
😺|smiling cat|happy
😻|heart eyes cat|love
🙀|weary cat|shock
🫠|melting face|melt heat embarrassed
🥲|smiling face with tear|happy sad grateful
🥹|face holding back tears|emotional touched
🫡|saluting face|salute respect
🫢|face with open eyes and hand over mouth|shock surprise
🫣|face with peeking eye|scared peek
🫤|face with diagonal mouth|unsure disappointed
🥱|yawning face|tired bored
🤧|sneezing face|sick sneeze
🤕|face with head bandage|hurt injured
👺|goblin|tengu monster
👾|alien monster|space invader game
😸|grinning cat with smiling eyes|happy
😹|cat with tears of joy|laugh lol
😼|cat with wry smile|smirk
😽|kissing cat|kiss
😿|crying cat|sad
😾|pouting cat|angry`,
  'People & gestures': `👋|waving hand|hello goodbye
🤚|raised back of hand|stop
✋|raised hand|high five
🖖|vulcan salute|spock
👌|ok hand|okay perfect
🤌|pinched fingers|italian
✌️|victory hand|peace
🤞|crossed fingers|luck
🤟|love you gesture|love
🤘|sign of the horns|rock
🤙|call me hand|shaka
👈|pointing left|finger
👉|pointing right|finger
👆|pointing up|finger
👇|pointing down|finger
🖕|middle finger|rude fuck
👍|thumbs up|yes good like
👎|thumbs down|no dislike
✊|raised fist|power
👊|oncoming fist|punch bump
👏|clapping hands|applause
🙌|raising hands|celebrate
👐|open hands|welcome
🤝|handshake|deal
🙏|folded hands|please thanks pray
💪|flexed biceps|strong muscle
🦵|leg|kick
🦶|foot|feet
👀|eyes|look
👅|tongue|lick
👄|mouth|lips
🧠|brain|smart
👶|baby|child
👨|man|person
👩|woman|person
🧔|bearded person|beard
👴|old man|grandpa
👵|old woman|grandma
🙈|see no evil|monkey
🙉|hear no evil|monkey
🙊|speak no evil|monkey
🙋|raising hand person|volunteer
🤦|facepalm|oops idiot
🤷|shrug|whatever dunno
👮|police officer|cop
👷|construction worker|builder tradie
🎅|Santa Claus|christmas father christmas
🤶|Mrs Claus|christmas
🧙|mage|wizard magic
🧟|zombie|undead
🕺|man dancing|party
💃|woman dancing|party
👑|crown|king queen winner
🫶|heart hands|love
🫰|hand with index finger and thumb crossed|finger heart money
🤏|pinching hand|small tiny
🤜|right facing fist|fist bump
🤛|left facing fist|fist bump
🤲|palms up together|pray hands
🖐️|hand with fingers splayed|high five
👂|ear|listen hearing
👃|nose|smell
🦷|tooth|dentist
🦴|bone|skeleton
🧑|person|adult
🧒|child|kid
👧|girl|child
👦|boy|child
🧝|elf|christmas fantasy
🧛|vampire|halloween
🧞|genie|magic
🧜|merperson|mermaid ocean`,
  'Animals & nature': `🐶|dog face|puppy
🐱|cat face|kitten
🐭|mouse face|animal
🐹|hamster|pet
🐰|rabbit face|bunny
🦊|fox|animal
🐻|bear|animal
🐼|panda|bear
🐨|koala|australia
🐯|tiger face|cat
🦁|lion|king
🐮|cow face|moo
🐷|pig face|oink
🐸|frog|toad
🐵|monkey face|ape
🦍|gorilla|ape
🐔|chicken|hen
🐧|penguin|bird
🐦|bird|tweet
🦆|duck|bird
🦅|eagle|bird
🦉|owl|bird
🦄|unicorn|magic
🐝|honeybee|bee
🦋|butterfly|insect
🐌|snail|slow
🐛|bug|caterpillar
🕷️|spider|insect
🐢|turtle|slow
🐍|snake|reptile
🦎|lizard|reptile
🦖|T-Rex|dinosaur
🐙|octopus|sea
🦑|squid|sea
🦀|crab|sea
🐠|tropical fish|ocean
🦈|shark|ocean
🐬|dolphin|ocean
🐳|whale|ocean
🐊|crocodile|australia
🦘|kangaroo|australia
🐓|rooster|cock chicken
🐕|dog|puppy
🐈|cat|pet
🐎|horse|racing
🐑|sheep|lamb
🦌|deer|reindeer christmas
🐉|dragon|fantasy
🎄|Christmas tree|xmas festive
🌲|evergreen tree|pine forest
🌴|palm tree|tropical
🌵|cactus|desert
🌹|rose|flower love
🌻|sunflower|flower
🍀|four leaf clover|luck lucky
🍁|maple leaf|autumn
🌈|rainbow|pride
☀️|sun|sunny weather
🌙|crescent moon|night
⭐|star|winner
🌟|glowing star|sparkle
✨|sparkles|magic
⚡|lightning|electric
🔥|fire|hot lit
❄️|snowflake|winter christmas
☃️|snowman|winter christmas
💧|droplet|water
🌊|wave|ocean
🦭|seal|ocean sea
🦦|otter|animal
🦥|sloth|slow animal
🦔|hedgehog|animal
🦇|bat|halloween animal
🐺|wolf|animal
🦝|raccoon|animal
🐴|horse face|racing
🫎|moose|animal
🫏|donkey|animal
🐐|goat|greatest
🐖|pig|animal
🐄|cow|animal
🐘|elephant|animal
🦒|giraffe|animal
🦓|zebra|animal
🦏|rhinoceros|rhino animal
🦛|hippopotamus|hippo animal
🐡|blowfish|puffer fish sea
🪼|jellyfish|ocean sea
🦞|lobster|seafood
🦐|shrimp|prawn seafood
🪸|coral|ocean reef
🌺|hibiscus|flower tropical
🌸|cherry blossom|flower
🌷|tulip|flower
🍄|mushroom|fungus
☁️|cloud|weather
🌧️|cloud with rain|weather
🌪️|tornado|storm weather
🌍|globe showing Europe Africa|earth world
🌏|globe showing Asia Australia|earth world`,
  'Food & drink': `🍏|green apple|fruit
🍎|red apple|fruit
🍐|pear|fruit
🍊|orange|fruit
🍋|lemon|citrus
🍌|banana|fruit
🍉|watermelon|fruit
🍇|grapes|wine fruit
🍓|strawberry|fruit
🍒|cherries|fruit
🍑|peach|bum butt
🍍|pineapple|fruit
🥑|avocado|food
🍆|eggplant|aubergine dick
🥕|carrot|vegetable
🌽|corn|vegetable
🌶️|hot pepper|chilli spicy
🥒|cucumber|pickle
🥔|potato|vegetable
🥐|croissant|bread
🍞|bread|toast
🧀|cheese|food
🥚|egg|food
🥓|bacon|food
🥩|cut of meat|steak
🍗|poultry leg|chicken
🍖|meat on bone|food
🌭|hot dog|sausage
🍔|hamburger|burger
🍟|french fries|chips
🍕|pizza|food
🌮|taco|mexican
🌯|burrito|mexican
🥗|green salad|healthy
🍿|popcorn|movie
🍣|sushi|japanese
🍤|fried shrimp|prawn
🍜|steaming bowl|noodles ramen
🍦|ice cream|dessert
🍩|doughnut|donut
🍪|cookie|biscuit
🎂|birthday cake|party
🧁|cupcake|cake
🍫|chocolate bar|sweet
🍬|candy|lolly
🍭|lollipop|sweet
🍯|honey pot|sweet
🍼|baby bottle|milk
☕|hot beverage|coffee tea
🍵|teacup|tea
🍺|beer mug|drink booze
🍻|clinking beer mugs|cheers beer
🥂|clinking glasses|cheers champagne
🍷|wine glass|red wine booze
🥃|tumbler glass|whisky whiskey bourbon
🍸|cocktail glass|martini booze
🍹|tropical drink|daiquiri cocktail
🍾|bottle with popping cork|champagne party
🥤|cup with straw|soft drink soda
🧊|ice cube|cold
🥭|mango|fruit
🥝|kiwi fruit|fruit
🫐|blueberries|fruit
🍅|tomato|vegetable
🥦|broccoli|vegetable
🧄|garlic|food
🧅|onion|food
🥨|pretzel|snack
🥞|pancakes|breakfast
🧇|waffle|breakfast
🥪|sandwich|lunch
🥙|stuffed flatbread|kebab pita
🍛|curry rice|dinner
🍚|cooked rice|food
🥟|dumpling|food
🦪|oyster|seafood
🍧|shaved ice|dessert
🍨|ice cream bowl|dessert
🥛|glass of milk|drink
🫖|teapot|tea drink
🧋|bubble tea|boba drink
🧃|beverage box|juice drink
🧉|mate|drink
🍶|sake|japanese drink
🧂|salt|seasoning
🍽️|fork and knife with plate|dinner`,
  'Activities': `⚽|soccer ball|football sport
🏀|basketball|sport
🏈|american football|sport
🏉|rugby football|footy sport
⚾|baseball|sport
🎾|tennis|sport
🏐|volleyball|sport
🎱|pool eight ball|billiards
🏓|ping pong|table tennis
🏏|cricket|sport
⛳|flag in hole|golf
🏹|bow and arrow|archery
🎣|fishing pole|fish
🥊|boxing glove|fight
🏆|trophy|winner champion
🥇|gold medal|first winner
🥈|silver medal|second
🥉|bronze medal|third
🏅|sports medal|winner
🎯|bullseye|target darts
🎮|video game|controller gaming
🕹️|joystick|arcade
🎲|game die|dice poker roll
🃏|joker|cards poker
🎰|slot machine|gambling casino
🎳|bowling|game
🎨|artist palette|art paint drawing
🎭|performing arts|theatre
🎤|microphone|karaoke singing
🎧|headphone|music
🎸|guitar|music rock
🥁|drum|music
🎹|musical keyboard|piano
🎵|musical note|music
🎶|musical notes|music
🎬|clapper board|movie film
🎊|confetti ball|party
🎉|party popper|celebrate birthday
🎈|balloon|party
🎁|wrapped gift|present christmas
🎀|ribbon|gift
🎆|fireworks|celebrate
🧨|firecracker|bang
🀄|mahjong red dragon|tile game
🎴|flower playing cards|cards game
🧩|puzzle piece|jigsaw game
♟️|chess pawn|game
🪀|yo yo|toy game
🪁|kite|toy
🛹|skateboard|sport
🛼|roller skate|sport
🎿|skis|snow sport
🛷|sled|snow christmas
🏒|ice hockey|sport
🥋|martial arts uniform|karate judo
🏋️|person lifting weights|gym weightlifting
🤺|person fencing|sword sport
🪩|mirror ball|disco party
🎺|trumpet|music
🎷|saxophone|music
🪕|banjo|music
🎻|violin|music`,
  'Travel & objects': `🚗|car|drive vehicle
🚕|taxi|cab
🚌|bus|transport
🏎️|racing car|fast
🚓|police car|cop
🚑|ambulance|emergency
🚒|fire engine|firetruck
🚚|delivery truck|vehicle
🚜|tractor|farm
🏍️|motorcycle|bike
🚲|bicycle|bike
✈️|airplane|plane flight
🚁|helicopter|flight
🚀|rocket|space
🛸|flying saucer|ufo alien
⛵|sailboat|boat
🚢|ship|cruise
⚓|anchor|boat
🏠|house|home
🏰|castle|fantasy
🏝️|desert island|holiday
⛺|tent|camping
🏖️|beach with umbrella|holiday
🌋|volcano|eruption
🗺️|world map|travel
🧭|compass|direction
💎|gem stone|diamond
💍|ring|engagement
💰|money bag|cash poker
💵|dollar banknote|cash money
💸|money with wings|expensive
💳|credit card|money
💡|light bulb|idea
🔦|flashlight|torch
🕯️|candle|light
📱|mobile phone|iphone android
💻|laptop|computer
📷|camera|photo
📺|television|tv
⏰|alarm clock|time
🔋|battery|power
🔌|electric plug|power
🔨|hammer|builder tool
🪚|carpentry saw|builder tool
🔧|wrench|spanner tool
🪛|screwdriver|builder tool
🪜|ladder|builder tool
🧱|brick|building
🪠|plunger|toilet
🚽|toilet|loo bathroom
🧻|roll of paper|toilet
🛁|bathtub|bathroom
🔑|key|lock
🔒|locked|secure
🔔|bell|christmas
📣|megaphone|cheer
📚|books|read
✏️|pencil|draw write
🖌️|paintbrush|draw art
🧸|teddy bear|toy
🪄|magic wand|wizard
💊|pill|medicine
💉|syringe|needle
🧲|magnet|attract
🧯|fire extinguisher|safety
🚬|cigarette|cig cigarettes ciggy ciggies smoke smoking tobacco dart durries
🕶️|sunglasses|sunnies shades glasses cool eyewear
👓|glasses|spectacles eyewear
🥽|goggles|eye protection
🧢|billed cap|hat baseball
🎩|top hat|fancy magician
👒|woman hat|sun hat
👔|necktie|tie suit
👕|t shirt|shirt clothes
👗|dress|clothes
👙|bikini|swimwear
👠|high heeled shoe|heels
👟|running shoe|sneakers trainers
🩴|thong sandal|flip flops footwear
🎒|backpack|bag
👜|handbag|purse bag
☂️|umbrella|rain
🛵|motor scooter|vehicle
🛻|pickup truck|ute vehicle
🚂|locomotive|train
🚆|train|railway
🛶|canoe|boat kayak
🛩️|small airplane|plane flight
🏡|house with garden|home
🏢|office building|work
🏨|hotel|holiday
🏥|hospital|medical
🛟|ring buoy|life saving
🧳|luggage|suitcase travel
🎃|jack o lantern|pumpkin halloween
🪦|headstone|grave cemetery
⚰️|coffin|funeral
🧹|broom|clean witch
🪣|bucket|clean
🪥|toothbrush|dental
🧼|soap|clean
🧽|sponge|clean
🧴|lotion bottle|sunscreen
🧷|safety pin|fastener
✂️|scissors|cut
📎|paperclip|stationery
📌|pushpin|pin
📦|package|box delivery
✉️|envelope|mail letter
💌|love letter|valentine
🔗|link|chain
⚙️|gear|settings machine
⚖️|balance scale|justice
💣|bomb|explosion
🪓|axe|tool
⛏️|pick|tool mining
🛠️|hammer and wrench|tools
🪵|wood|timber log`,
  'Symbols & flags': `❤️|red heart|love
🧡|orange heart|love
💛|yellow heart|love
💚|green heart|love
💙|blue heart|love
💜|purple heart|love
🖤|black heart|love
🤍|white heart|love
🤎|brown heart|love
💔|broken heart|sad
💕|two hearts|love
💖|sparkling heart|love
💘|heart with arrow|cupid love
💋|kiss mark|lips love
💯|hundred points|perfect score
💢|anger symbol|angry
💥|collision|boom explosion
💫|dizzy|stars
💦|sweat droplets|water
💨|dashing away|fart wind
💬|speech balloon|chat
💤|zzz|sleep
♠️|spade suit|cards poker
♥️|heart suit|cards poker
♦️|diamond suit|cards poker
♣️|club suit|cards poker
✅|check mark|yes done tick
❌|cross mark|no wrong
❓|question mark|what
❗|exclamation mark|warning
⚠️|warning|caution
🚫|prohibited|no stop
🔞|no one under eighteen|adults
♻️|recycling|green
☮️|peace symbol|peace
☯️|yin yang|balance
♾️|infinity|forever
🏁|chequered flag|finish race
🚩|triangular flag|red flag
🏴‍☠️|pirate flag|jolly roger
🏳️‍🌈|rainbow flag|pride
🇦🇺|Australia flag|aussie
🇳🇿|New Zealand flag|kiwi
🇬🇧|United Kingdom flag|britain uk
🇺🇸|United States flag|america usa
🇨🇦|Canada flag|canadian
🇮🇪|Ireland flag|irish
🇫🇷|France flag|french
🇩🇪|Germany flag|german
🇮🇹|Italy flag|italian
🇯🇵|Japan flag|japanese
🩷|pink heart|love
🩵|light blue heart|love
🩶|grey heart|gray love
❣️|heart exclamation|love
💞|revolving hearts|love
💓|beating heart|love
💗|growing heart|love
💝|heart with ribbon|gift love
💟|heart decoration|love
🚭|no smoking|cigarette prohibited
☢️|radioactive|radiation danger
☣️|biohazard|danger
⚜️|fleur de lis|symbol
🔱|trident emblem|symbol
⭕|hollow red circle|ring
🔴|red circle|shape
🟠|orange circle|shape
🟡|yellow circle|shape
🟢|green circle|shape
🔵|blue circle|shape
🟣|purple circle|shape
⚫|black circle|shape
⚪|white circle|shape
🔶|large orange diamond|shape
🔷|large blue diamond|shape
➡️|right arrow|direction
⬅️|left arrow|direction
⬆️|up arrow|direction
⬇️|down arrow|direction
🔄|counterclockwise arrows button|refresh repeat
🔊|speaker high volume|sound loud
🔇|muted speaker|sound mute
🏳️‍⚧️|transgender flag|pride
🇿🇦|South Africa flag|south african
🇪🇸|Spain flag|spanish
🇧🇷|Brazil flag|brazilian
🇮🇳|India flag|indian
🇨🇳|China flag|chinese
🇰🇷|South Korea flag|korean`,
};
export const emojiCategories = Object.keys(groups);
export const emojis: Emoji[] = Object.entries(groups).flatMap(([category, rows]) => rows.split('\n').map(row => {
  const [unicode, name, keywords] = row.split('|');
  return { unicode, name, keywords, category };
}));
export function searchEmojis(query: string, category: string, recent: string[] = []): Emoji[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const candidates = terms.length ? emojis : category === 'Recent'
    ? recent.map(value => emojis.find(e => e.unicode === value)).filter((e): e is Emoji => !!e)
    : emojis.filter(e => e.category === category);
  return candidates.filter(e => terms.every(term => `${e.unicode} ${e.name} ${e.keywords} ${e.category}`.toLocaleLowerCase().includes(term)));
}
export function rememberEmoji(recent: string[], unicode: string): string[] {
  return [unicode, ...recent.filter(value => value !== unicode)].filter(value => emojis.some(e => e.unicode === value)).slice(0, 24);
}
