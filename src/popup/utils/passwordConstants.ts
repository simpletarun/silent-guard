export const AMBIGUOUS = '0OIl1'
export const LOWERS = 'abcdefghijklmnopqrstuvwxyz'
export const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'

export const CONSONANTS = 'bcdfghjklmnpqrstvwxyz'
export const VOWELS = 'aeiou'

const RAW_WORDS = [
  'apple','beach','chair','dance','eagle','flame','grape','house','igloo','joker','knife','lemon','mango','noble','ocean',
  'piano','queen','river','stone','tiger','unity','vivid','whale','xenon','yacht','zebra','aster','bloom','coral','daisy',
  'ember','frost','gleam','hazel','ivory','jewel','kayak','lilac','maple','north','olive','pearl','quilt','robin','satin',
  'tulip','umbra','vapor','waltz','amber','bliss','crane','drift','elbow','flick','grain','hover','index','jolly','kneel',
  'lodge','mirth','ninja','orbit','plank','quota','ridge','scone','truce','ultra','vigor','wrist','agile','blend','crisp',
  'dream','elite','flock','grace','heart','jumpy','kebab','lunar','merry','night','opera','pixel','radar','solar','tempo',
  'union','vocal','wider','yield','badge','climb','dodge','faith','gauge','hatch','joust','koala','leash','moist','niece',
  'pouch','quack','roast','sheep','trait','vault','wreak','zonal','blunt','civic','depot','equip','flair','giddy','humor',
  'jazzy','kiosk','lapse','mimic','nanny','otter','plaza','quark','repel','scout','tidal','usher','viper','woozy','ascot',
  'briar','cello','dowry','elfin','froze','gulch','hotel','inlet','jumbo','kleen','latch','motif','navel','ovary','pansy',
  'quasi','royal','shrub','tabby','uncap','vixen','wenge','yodel','zesty','batik','chunk','debug','envoy','floss',
  'hippo','jiffy','kraal','lurid','mambo','nacho','opium','pesto','quill','rumen','syrup','ungot','vibes',
  'wacky','xerox','yuppy','zloty','axial','bicep','chord','drone','ethyl','fossa','golem','helix','inter','japan','kondo',
  'larva','mocha','neon','ouija','radix','sulky','tromp','unfed','whelp','axion','bongo','cacti','demo',
  'elude','grate','horse','input','jerky','kajal','lemur','metro','nudge','ohmic','prank','rumba','stomp',
  'thump','ulnar','vista','wispy','xenial','yawed','altar','basin','crest','dwell','ebony','fiber','gland','heist',
  'ionic','kebab','lumen','match','nifty','oxide','pluck','roost','slick','twine','vouch',
  'cabin','drank','exalt','flute','gouge','hutch','irked','knelt','larch','moult','nacre','ovoid','pique','ragas',
  'shank','tread','unbar','vireo','welsh','yawls','zones','ables','blimp','crony','dicey','eager','froth','guppy',
  'hefty','icily','kooky','leggy','moody','oddly','puffy','roomy','saucy','tawdy','udder','veery',
  'warmy','yucky','zooey','aloft','bloke','clasp','dowse','elate','funky','hashy','indie','laxly',
  'munch','nymph','phlox','relit','thyme','uncut','wacko','yummy','zanza','ample',
  'brisk','cleat','drape','ensue','flaky','gourd','hound','inept','janky','knoll','leapt','milky','nodal','olden',
  'rawly','spank','baton','decal','frock',
  'hymen','idyll','melba','ovule','panty','quern','ryder','savor','trunk','umber',
  'vinyl','wizen','axile','deist','kudzu','ligne',
  'niche','opine','relic','sabin','trefa','unset','yulan','azine','bolar','cannas',
  'dinar','gloat','hijab','imaum','kurta','lotic','motor','nidor','oleic','picot','quoll','rolag',
  'sulci','talar','vimen','wince','xenyl','yirth','zizel','baste','cigar','dhoti','elvan','gulag','hacek',
  'indol','kulfi','lakh','modem','nisei','oleum','pipal','qawal','rewin','sapan','tendu','upbow','vinal','wacke',
  'xenic','yacca','zymic','awing','blain','cunei','dotal','ephod','fichu','gaiety','hijra','infer','kente',
  'mhorr','nival','pence','reird','skeen','taira','vells','xylol','yogic','zakat','alate',
  'biont','cosec','detin','frise','grike','intis','kohen','linch','mori','nucal','psoas',
  'rifte','trior','wheep','xeric','abaci','biker',
  'fique','hylid','ingle','koko','linin','nerol','piend','rhyta','stree','thymi',
  'unbit','vegie','wawls','yoker','zorro','abies','barye','cadge','diota',
  'neive','pinta','rhumb',
  'koala','panda','rhino','camel','dolphin','falcon','gorilla','iguana','jackal',
  'moose','newt','ocelot','puma','quail','rabbit','sloth','tapir','uakari','vulpine','walrus','xerus','yak',
  'alder','birch','cedar','dogwood','elm','fir','ginkgo','hemlock','iroko','juniper','kauri',
  'nutmeg','oak','pine','quince','redwood','spruce','teak','umbrella','vine','willow','xerophyte','yew','zelkova',
]

export const WORDS = [...new Set(RAW_WORDS)]
export const UNIQUE_WORD_COUNT = WORDS.length
