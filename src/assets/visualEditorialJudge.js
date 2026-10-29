/**
 * Visual Editorial Judge — Stage B Semantic Decision Layer
 * Milestone — Production Hardening & Semantic Visual Understanding
 * 
 * Compares:
 * VisibleNeed (what the narration demands)
 * against
 * VisualInspection (what the pixels actually show)
 * 
 * Enforces sequential hard gates:
 * Gate 1: Technical validity
 * Gate 2: Semantic validity (rejects ACCIDENTAL and WRONG)
 * Gate 3: Semantic confidence
 * Gate 4: Format fitness
 * Gate 5: Crop fitness
 * Gate 6: Visual quality
 * Gate 7: Sequence fitness
 * 
 * Computes explicit semanticDistance (0.0 = identical, 1.0 = unrelated).
 * Persists full selection explanation (selectionReason, visibleMeaning, whyItMatchesNarration, matchClass, confidence).
 */

import { compareVisualToNeed } from './visualInspectionService.js';
import { evaluateFormatFitness } from './formatFitnessScorer.js';
import { evaluateEditorialUsefulness } from './editorialUsefulnessEvaluator.js';

export const SEMANTIC_MATCH_POLICY_VERSION = '2.1.0';
export const EDITORIAL_USEFULNESS_POLICY_VERSION = '2.1.0';
export const SEARCH_CONCEPT_POLICY_VERSION = '2.1.0';
export const SEQUENCE_POLICY_VERSION = '2.1.0';

/**
 * Contextual Adversarial Collision & Accidental Match Patterns
 */
const ACCIDENTAL_KEYWORD_PATTERNS = [
  // 1. Parallel universe / Multiverse vs Guitar effects pedal / Audio stompbox
  {
    topicRegex: /parallel\s+universe|multiverse|quantum\s+branch|timeline/i,
    literalExceptionRegex: /guitar|music\s+album|fender|audio\s+gear/i,
    candidateRejectRegex: /guitar|pedal|stompbox|amplifier|fender|audio\s+effect|electric\s+guitar/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.98,
    reason: 'accidental_keyword_match: guitar pedal named "Parallel Universe" does not represent quantum physics concept',
  },
  // 2. Data center / Cloud server vs Abandoned ruin / Bunker / Relic
  {
    topicRegex: /data\s+center|datacenter|server\s+rack|cloud\s+computing|backend\s+cluster/i,
    literalExceptionRegex: /abandoned|ruins|relic|bunker|historical\s+monument/i,
    candidateRejectRegex: /abandoned|ruins|duga|radar\s+station|military\s+relic|derelict|pripyat|bunker|decay/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: abandoned concrete bunker or ruin does not represent modern cloud datacenter',
  },
  // 3. Submarine cables vs Household power strip / desk cords
  {
    topicRegex: /undersea|submarine\s+cable|ocean\s+floor|seabed|transatlantic/i,
    literalExceptionRegex: /household|desk|home\s+office|extension\s+cord/i,
    candidateRejectRegex: /tangled\s+wires|desk\s+cables|extension\s+cord|power\s+strip|wall\s+outlet/i,
    classification: 'WRONG',
    semanticDistance: 0.90,
    reason: 'wrong_subject_match: household extension cord or desk wire does not represent transoceanic fiber-optic cable',
  },
  // 4. Time travel / Narrative journey vs Geographical road map / Highway navigation
  {
    topicRegex: /travel\s+back\s+in\s+time|time\s+travel|alternate\s+timeline|grandfather\s+paradox|past\s+and\s+future/i,
    literalExceptionRegex: /london|paris|city\s+to\s+city|highway|road\s+trip|geography|interstate/i,
    candidateRejectRegex: /road\s+map|highway\s+map|gps\s+navigation|interstate\s+freeway|traffic\s+map/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.92,
    reason: 'accidental_keyword_match: geographical road map does not represent temporal physics or time travel',
  },
  // 5. Decision / Timeline Risk vs Wet floor / Physical hazard warning sign
  {
    topicRegex: /risk\s+changing|timeline\s+risk|paradox\s+risk|consequences\s+of\s+changing|decision/i,
    literalExceptionRegex: /wet\s+floor|slippery|spill|janitorial|cleaning|radiation\s+warning/i,
    candidateRejectRegex: /wet\s+floor|caution\s+slippery|yellow\s+warning\s+triangle|cleaning\s+in\s+progress|slip\s+hazard/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: yellow wet-floor caution triangle does not represent conceptual timeline risk',
  },
  // 6. Memory leak in software vs Dripping water pipe / plumbing leak
  {
    topicRegex: /memory\s+leak|ram\s+exhaustion|heap\s+allocation|unreleased\s+pointers|\bram\b/i,
    literalExceptionRegex: /plumbing|water\s+leak|pipe\s+burst|faucet|sink/i,
    candidateRejectRegex: /pipe|faucet|plumber|plumbing|puddle|water\s+leak/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: leaking water pipe does not represent software RAM memory exhaustion',
  },
  // 6b. CPU Multithreading vs sewing thread
  {
    topicRegex: /worker\s+thread|cpu\s+thread|multithread|hardware\s+cores|software\s+thread|\bthread\b/i,
    literalExceptionRegex: /sewing|needle|spool|textile|cloth|tailor/i,
    candidateRejectRegex: /sewing|needle|spool|textile|cloth|yarn/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: sewing thread or spool does not represent CPU multithreading execution',
  },
  // 7. Cloud computing infrastructure vs Weather cumulus clouds in sky
  {
    topicRegex: /cloud\s+computing|cloud\s+server|cloud\s+architecture|cloud\s+provider|aws|azure|\bthe\s+cloud\b|\bcloud\b/i,
    literalExceptionRegex: /weather|meteorolog|rain|storm|sky\s+forecast/i,
    candidateRejectRegex: /fluffy|cumulus|blue\s+sky|weather|storm\s+cloud/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.92,
    reason: 'accidental_keyword_match: atmospheric weather clouds do not represent cloud computing server infrastructure',
  },
  // 8. Network data packet loss vs Postal cardboard package / parcel delivery
  {
    topicRegex: /packet\s+loss|tcp\s+packet|network\s+packet|dropped\s+packets|\bpacket\b/i,
    literalExceptionRegex: /mail|postal|shipping|cardboard\s+box|parcel\s+delivery/i,
    candidateRejectRegex: /cardboard\s+box|parcel\s+delivery|shipping\s+box|postal\s+package\s+on\s+porch|shipping\s+package/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.94,
    reason: 'accidental_keyword_match: cardboard shipping package does not represent network data packets',
  },
  // 9. CPU Branch prediction vs Tree branch with green leaves
  {
    topicRegex: /branch\s+prediction|cpu\s+branch|pipeline\s+stall|instruction\s+branch/i,
    literalExceptionRegex: /tree|wood|forestry|botany|foliage/i,
    candidateRejectRegex: /tree\s+branch|wooden\s+stick|branch\s+with\s+leaves|forest\s+tree/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: botanical tree branch does not represent CPU branch prediction',
  },
  // 10. Operating system kernel panic vs Corn on the cob / popcorn
  {
    topicRegex: /kernel\s+panic|linux\s+kernel|os\s+kernel|kernel\s+space/i,
    literalExceptionRegex: /corn|popcorn|maize|agriculture|snack/i,
    candidateRejectRegex: /corn\s+on\s+cob|popcorn\s+bowl|maize\s+seed|corn\s+kernels/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.98,
    reason: 'accidental_keyword_match: edible corn kernels do not represent operating system kernel crash',
  },
  // 11. Network protocol layer vs Fishing net on boat
  {
    topicRegex: /network\s+layer|osi\s+model|protocol\s+stack|ip\s+routing/i,
    literalExceptionRegex: /fishing|trawler|fisherman|catch|fish/i,
    candidateRejectRegex: /fishing\s+net|trawler\s+net|rope\s+mesh\s+boat/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: commercial fishing net does not represent networking protocol layers',
  },
  // 12. CPU Cache miss vs Cash register money till
  {
    topicRegex: /cache\s+miss|l1\s+cache|cpu\s+cache|hardware\s+cache/i,
    literalExceptionRegex: /cash\s+register|supermarket\s+till|retail\s+money/i,
    candidateRejectRegex: /cash\s+register|money\s+till|dollar\s+bills\s+drawer|supermarket\s+checkout/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: retail cash register drawer does not represent microarchitecture cache misses',
  },
  // 13. Electric current / data flow vs Rushing river water current
  {
    topicRegex: /current\s+flow|electrical\s+current|electron\s+current/i,
    literalExceptionRegex: /river|rapids|creek|stream|kayak|water/i,
    candidateRejectRegex: /rushing\s+river|water\s+rapids|river\s+current|kayaker\s+in\s+river/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.93,
    reason: 'accidental_keyword_match: river water current does not represent electrical current flow',
  },
  // 14. Financial bond yield vs Chemical molecular bond
  {
    topicRegex: /bond\s+yield|treasury\s+bond|government\s+bond|yield\s+curve/i,
    literalExceptionRegex: /chemical|molecular|covalent|atomic|chemistry/i,
    candidateRejectRegex: /molecular\s+bond|ball\s+and\s+stick\s+molecule|chemical\s+bonding|handcuffs/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: chemical molecular bond does not represent financial treasury bond yields',
  },
  // 15. Computer malware virus vs Biological pathogen virus
  {
    topicRegex: /computer\s+virus|malware|trojan|ransomware|\bvirus\b/i,
    literalExceptionRegex: /biology|pathogen|medical|flu|covid|bacteria|biological\s+infection/i,
    candidateRejectRegex: /biological|pathogen|medical|petri|spherical/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.88,
    reason: 'accidental_keyword_match: biological pathogen does not represent computer software malware virus',
  },
  // 16. Financial bank run vs People jogging near river bank
  {
    topicRegex: /bank\s+run|banking\s+panic|liquidity\s+crisis|withdrawing\s+deposits/i,
    literalExceptionRegex: /jogging|running\s+near\s+river|park|exercise/i,
    candidateRejectRegex: /jogging|river\s+bank|grassy\s+river/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: people exercising along river bank does not represent a financial bank run',
  },
  // 17. Software deadlock vs Door padlock hardware, physical keys, handcuffs, and chains
  {
    topicRegex: /software\s+deadlock|process\s+deadlock|concurrency\s+deadlock|resource\s+deadlock|database\s+deadlock|transaction\s+deadlock|circular\s+wait|\bdeadlock\b/i,
    literalExceptionRegex: /door\s+lock|padlock|brass\s+key|hardware\s+lock/i,
    candidateRejectRegex: /padlock|chain\s+lock|locked\s+door|chain\s+and\s+lock|iron\s+chain|metal\s+chain|door\s+deadbolt|locked\s+gate|movie\s+poster|film\s+poster|lobby\s+card|handcuff|handcuffs|prison|jail|escape|keys?\b|brass\s+key|holding\s+keys?/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.94,
    reason: 'accidental_keyword_match: hardware padlock, physical key, handcuffs, or prison do not represent multithreaded process concurrency deadlock',
  },
  // 18. Grandparents / family genealogy vs Unrelated mechanical or electronic device
  {
    topicRegex: /grandparents\s+never\s+meet|family\s+ancestry|parents|grandfather\s+paradox/i,
    literalExceptionRegex: /electronic|circuit|device|gadget/i,
    candidateRejectRegex: /printed\s+circuit\s+board|motherboard|electronic\s+gadget|soldering\s+iron/i,
    classification: 'WRONG',
    semanticDistance: 0.98,
    reason: 'wrong_subject_match: unrelated electronic/mechanical hardware does not represent human family genealogy',
  },
  // 19. Software memory management garbage collector vs Municipal sanitation worker (Sections 77, 78)
  {
    topicRegex: /garbage\s+collect(or|ion)|memory\s+leak|heap\s+reclaim|v8\s+engine|javascript\s+memory|garbage\s+collected/i,
    literalExceptionRegex: /municipal|trash\s+pickup|waste\s+management|street\s+cleaner|sanitation\s+worker/i,
    candidateRejectRegex: /sanitation\s+worker|garbage\s+collector\s+works\s+on\s+a\s+city\s+street|waste\s+collection|trash\s+truck|city\s+street\s+at\s+dusk/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: municipal street sanitation worker does not represent software memory management garbage collector',
  },
  // 20. Branching timelines / causality vs literal botanical tree branches (Sections 75, 76)
  {
    topicRegex: /branching\s+timeline|timeline\s+branch|parallel\s+universe|multiverse|grandfather\s+paradox/i,
    literalExceptionRegex: /botanical|tree\s+branch\s+splits|nature\s+forest|twigs?\s+under\s+sky/i,
    candidateRejectRegex: /tree\s+twigs?|bare\s+branches?|leafless\s+twigs?|tree\s+bark|growing\s+in\s+park/i,
    classification: 'METAPHORICAL',
    semanticDistance: 0.65,
    reason: 'metaphorical_downgrade: botanical tree branches can only represent timeline bifurcation metaphorically, never directly',
  },
  // 21. Time paradox error mark vs Toyota Mark X automobile
  {
    topicRegex: /red\s+x|paradox|impossible\s+timeline|error\s+mark|causal\s+prohibition/i,
    literalExceptionRegex: /toyota|automobile|car\s+show|vehicle|sedan/i,
    candidateRejectRegex: /toyota|mark\s+x|sedan|automobile|passenger\s+car/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: Toyota Mark X automobile does not represent symbolic red X paradox mark',
  },
  // 22. Time paradox / causal loop vs Paper currency / banknotes
  {
    topicRegex: /time\s+travel|grandfather\s+paradox|causal\s+loop|timeline|parallel\s+universe/i,
    literalExceptionRegex: /currency|rupee|dollar|economy|monetary|cash|banknote/i,
    candidateRejectRegex: /banknote|rupee|currency|gandhi\s+portrait|cash\s+bills|paper\s+money/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: currency banknotes do not represent theoretical physics causal loops',
  },
  // 23. Time paradox / cosmic censorship vs Motherboard / graphics card
  {
    topicRegex: /time\s+travel|grandfather\s+paradox|causal\s+timeline|cosmic\s+censorship|universe\s+shields/i,
    literalExceptionRegex: /motherboard|graphics\s+card|computer\s+chip|semiconductor|silicon\s+hardware/i,
    candidateRejectRegex: /motherboard|printed\s+circuit\s+board|sli\s+gtx|nvidia\s+sli|graphics\s+card/i,
    classification: 'WRONG',
    semanticDistance: 0.96,
    reason: 'wrong_subject_match: graphics card / motherboard hardware does not represent universe paradox barrier',
  },
  // 24. Branching timelines / parallel reality vs Video editing software split-screen UI (Regression fixture: Filmora / Premiere)
  {
    topicRegex: /branching\s+timeline|timeline\s+branch|parallel\s+universe|alternate\s+timeline|split\s+reality|reality\s+branches|causality\s+split|alternate\s+realit/i,
    literalExceptionRegex: /video\s+edit|split\s+screen\s+editing|post\s+production|premiere\s+tutorial|filmora/i,
    candidateRejectRegex: /filmora|video\s+editor|split\s+screen\s+effect|editing\s+timeline|capcut|premiere\s+pro|timeline\s+panel|render\s+queue|video\s+editing\s+software/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.94,
    reason: 'accidental_keyword_match: video-editing software split-screen UI does not represent cosmological branching timelines',
  },
  // 25. Time travel / Grandfather paradox vs Chinatown neon typography / LED face sign
  {
    topicRegex: /grandfather\s+paradox|branching\s+timeline|causal\s+loop|time\s+travel|quantum|paradox/i,
    literalExceptionRegex: /chinatown|neon\s+signage\s+in\s+tokyo|street\s+sign|billboard/i,
    candidateRejectRegex: /chinatown|chinese\s+neon|restaurant\s+sign|led\s+face|neon\s+face|unrelated\s+neon\s+typography|cocktail\s+bar\s+neon/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: unrelated Chinatown neon typography or LED face sign does not represent temporal paradox physics',
  },
  // 26. Self-consistency / Causal loop prohibition vs Traffic no-entry sign / road signs
  {
    topicRegex: /self[\s-]consistency|novikov|causal\s+loop|paradox\s+barrier|prohibit|time\s+travel\s+impossible/i,
    literalExceptionRegex: /traffic|highway|road\s+sign|driving|pedestrian/i,
    candidateRejectRegex: /no[\s-]entry\s+sign|traffic\s+sign|stop\s+sign|street\s+road\s+sign|do\s+not\s+enter/i,
    classification: 'METAPHORICAL',
    semanticDistance: 0.70,
    reason: 'metaphorical_downgrade: traffic no-entry sign is a metaphorical road symbol, not direct causal physics evidence',
  },
  // 27. Database / Software transactions vs Retail payments, credit cards, or Bitcoin
  {
    topicRegex: /database|sql|concurrency|deadlock|acid\b|postgres|mysql|sqlite|redis|mongodb|backend|server\s+transaction|transaction\s+(?:isolation|lock|wait|state|roll|commit|abort)|software\s+transaction/i,
    literalExceptionRegex: /bitcoin|crypto|credit\s+card|mastercard|visa|retail\s+payment|checkout\s+counter|bank\s+card/i,
    candidateRejectRegex: /bitcoin|crypto|ethereum|blockchain|credit\s+card|mastercard|visa|bank\s+card|payment\s+card|debit\s+card|wallet|shopping\s+cart|cash\s+register|pos\s+terminal/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: retail credit cards or cryptocurrency does not represent database ACID transactions',
  },
  // 28. Software thread wait queue / lock waiting vs Valet parking or hospitality waiting signs
  {
    topicRegex: /thread|process|deadlock|concurrency|mutex|lock|database|backend|query|transaction|worker\s+thread|cpu/i,
    literalExceptionRegex: /valet|parking|car\s+wash|hotel\s+lobby|hospital\s+waiting|bus\s+stop/i,
    candidateRejectRegex: /valet|parking|bring\s+your\s+car|please\s+wait\s+here|waiting\s+room|hospital\s+bed|reception\s+desk|bus\s+stop|train\s+station\s+bench/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.96,
    reason: 'accidental_keyword_match: valet parking or hospitality waiting sign does not represent software thread wait state',
  },
  // 29. Database relational tables vs Wooden dining furniture
  {
    topicRegex: /\b(?:database|sql|relational|postgres|mysql|sqlite|schema|deadlock)\b.*\b(?:tables?|rows?|columns?)\b|\b(?:tables?|rows?|columns?)\b.*\b(?:database|sql|relational|postgres|mysql|sqlite|schema|deadlock)\b|\bdatabase\s+table\b/i,
    literalExceptionRegex: /furniture|dining|kitchen|restaurant\s+table|wooden\s+table|tablecloth/i,
    candidateRejectRegex: /dining\s+table|wooden\s+table|kitchen\s+table|restaurant\s+table|tablecloth|coffee\s+table|furniture/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: wooden furniture dining table does not represent a database schema table',
  },
  // 30. Software concurrency deadlock vs Vehicular highway traffic jam
  {
    topicRegex: /deadlock|circular\s+wait|concurrency|mutex\b/i,
    literalExceptionRegex: /highway|interstate|traffic\s+jam|cars\s+stuck|road\s+traffic|vehicles/i,
    candidateRejectRegex: /traffic\s+jam|highway\s+congestion|cars\s+in\s+traffic|freeway\s+gridlock|bumper\s+to\s+bumper|rush\s+hour\s+traffic/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: highway vehicular traffic jam does not represent software concurrency deadlock',
  },
  // 31. Software resource ordering / hierarchy vs Paper stationery checklist
  {
    topicRegex: /database|deadlock|concurrency|lock\s+order|resource\s+hierarchy|mutex|software\s+engineering|system\s+design/i,
    literalExceptionRegex: /pen\s+and\s+paper|stationery|todo\s+list|grocery\s+list/i,
    candidateRejectRegex: /clipboard|paper\s+checklist|spiral\s+notebook|handwritten\s+notes|red\s+pen\s+marking|stationery/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.92,
    reason: 'accidental_keyword_match: paper stationery checklist does not represent software resource acquisition hierarchy',
  },
  // 32. Software crash / rollback vs Broken glass / Shattered window
  {
    topicRegex: /database|software|transaction|rollback|crash|deadlock|process/i,
    literalExceptionRegex: /glass\s+manufacturing|glazier|window\s+repair/i,
    candidateRejectRegex: /broken\s+glass|shattered\s+glass|cracked\s+glass|shattering|glass\s+shards/i,
    classification: 'ACCIDENTAL',
    semanticDistance: 0.95,
    reason: 'accidental_keyword_match: broken or shattered glass does not represent software database rollback',
  },
  // 33. Financial / Banking / Vault vs Supermarket / Grocery / Closet shelves
  {
    topicRegex: /bank|banking|vault|deposit|reserve|mortgage|debt|credit|monetary|finance/i,
    literalExceptionRegex: /supermarket|grocery|retail|shopping|closet/i,
    candidateRejectRegex: /supermarket|grocery|food\s+shelves|price\s+tags|cardboard\s+boxes|walk[\s-]in\s+closet|wardrobe|clothing\s+rack|aisle/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: supermarket food shelves or closet racks do not represent bank vaults or financial reserves',
  },
  // 34. Central Bank / Interest Rates vs Kitchen Oven / Stove / Temperature Dial
  {
    topicRegex: /central\s+bank|interest\s+rate|monetary\s+policy|federal\s+reserve|the\s+fed|macroeconomic|debt\s+cycle/i,
    literalExceptionRegex: /oven|stove|kitchen|baking|cooking|appliance/i,
    candidateRejectRegex: /temperature\s+dial|oven|stove|kitchen|stainless\s+steel\s+oven|baking|burner/i,
    classification: 'WRONG',
    semanticDistance: 0.96,
    reason: 'wrong_subject_match: kitchen oven temperature dial does not represent central bank monetary interest rates',
  },
  // 35. Currency / Economy vs Tourist Coin-Operated Binoculars / Vending Machine
  {
    topicRegex: /currency|money|banking|debt|financial|economy|inflation|recession/i,
    literalExceptionRegex: /binoculars|sightseeing|viewpoint|lookout/i,
    candidateRejectRegex: /coin[\s-]operated\s+binoculars|tourist\s+binoculars|vending\s+machine/i,
    classification: 'WRONG',
    semanticDistance: 0.94,
    reason: 'wrong_subject_match: coin-operated tourist binoculars does not represent monetary economics',
  },
  // 36. Financial Statement / Banking Documents vs Religious / Prayer Flags
  {
    topicRegex: /bank\s+statement|financial\s+statement|loan\s+contract|mortgage|ledger|bank\s+account/i,
    literalExceptionRegex: /prayer\s+flag|tibetan|temple|buddhism|ladakh/i,
    candidateRejectRegex: /prayer\s+flag|tibetan\s+prayer|fluttering\s+in\s+the\s+wind\s+at\s+ladakh|temple\s+flags/i,
    classification: 'WRONG',
    semanticDistance: 0.98,
    reason: 'wrong_subject_match: Tibetan prayer flags do not represent financial bank statements or documents',
  },
  // 37. Real World Locations & Empires (Dubai, Ancient Rome, Egypt, etc.) vs Mismatched Stock
  {
    topicRegex: /\bdubai\b/i,
    literalExceptionRegex: /general|global/i,
    candidateRejectRegex: /suburban\s+neighborhood|american\s+suburb|european\s+village|snowy\s+mountain/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: general suburbs or snowy mountains do not represent Dubai skyline or desert architecture',
  },
  {
    topicRegex: /\b(?:ancient\s+rome|roman\s+empire|colosseum|forum\s+romanum)\b/i,
    literalExceptionRegex: /modern\s+rome|italy\s+travel/i,
    candidateRejectRegex: /modern\s+skyscraper|glass\s+tower|subway\s+station|modern\s+train/i,
    classification: 'WRONG',
    semanticDistance: 0.95,
    reason: 'wrong_subject_match: modern skyscrapers or transit do not represent ancient Roman architecture',
  },
];

/**
 * Classifies a candidate asset against narration and VisibleNeed.
 */
export function classifyVisualMatch({ candidate, inspection, visibleNeed, editorialMode = 'TECHNICAL_EXPLAINER' }) {
  const candidateText = `${candidate.label || ''} ${candidate.title || ''} ${candidate.description || ''} ${(candidate.tags || []).join(' ')}`.toLowerCase();
  const narration = String(visibleNeed?.narrationText || visibleNeed?.action || visibleNeed?.subject || '').toLowerCase();
  const subject = String(visibleNeed?.subject || visibleNeed?.primaryConcept || '').toLowerCase();
  const videoTopic = String(visibleNeed?.videoTopic || '').toLowerCase();
  const topicTarget = `${narration} ${subject} ${videoTopic}`.trim();
  const inspectionText = [
    inspection?.primarySubject,
    inspection?.sceneSummary,
    inspection?.styleClass,
    ...(inspection?.visibleText || []),
    ...(inspection?.visibleObjects || []),
    candidateText,
  ].filter(Boolean).join(' ').toLowerCase();

  // A poster/document is a distinct representation class, not generic stock.
  // Pixel-derived inspection wins over a coincidental title/query match.
  const candidateIsPoster = /movie\s+poster|film\s+poster|theatrical\s+poster|vintage\s+poster|lobby\s+card/.test(inspectionText);
  const posterIsRequired = /movie\s+poster|film\s+poster|cinema\s+poster|theatrical\s+poster|archival\s+poster/.test(topicTarget)
    || visibleNeed?.visualProposition?.representationNeed === 'DOCUMENT';
  if (candidateIsPoster && !posterIsRequired) {
    return {
      classification: 'WRONG',
      subjectMatch: 0.02,
      actionMatch: 0.02,
      environmentMatch: 0.05,
      objectMatch: 0.02,
      meaningMatch: 0.02,
      evidenceMatch: 0.02,
      semanticDistance: 0.98,
      confidence: 0.99,
      reasons: ['representation_mismatch: a movie poster or lobby card does not depict the requested real-world or technical mechanism'],
      accept: false,
    };
  }

  // 1. Check explicit accidental keyword collision patterns first (homonyms like guitar pedal or cash register)
  for (const pattern of ACCIDENTAL_KEYWORD_PATTERNS) {
    const topicMatches = typeof pattern.topicRegex === 'function' ? pattern.topicRegex(topicTarget) : pattern.topicRegex.test(topicTarget);
    const hasLiteralException = pattern.literalExceptionRegex && pattern.literalExceptionRegex.test(topicTarget);
    
    if (topicMatches && !hasLiteralException && (pattern.candidateRejectRegex.test(candidateText) || pattern.candidateRejectRegex.test(inspectionText))) {
      return {
        classification: pattern.classification,
        subjectMatch: 0.05,
        actionMatch: 0.05,
        environmentMatch: 0.10,
        objectMatch: 0.05,
        meaningMatch: 0.05,
        evidenceMatch: 0.05,
        semanticDistance: pattern.semanticDistance,
        confidence: 0.98,
        reasons: [pattern.reason],
        accept: pattern.classification === 'METAPHORICAL' && visibleNeed?.literalnessRequirement === 'METAPHOR_ALLOWED',
      };
    }
  }

  // 2. Foreign Entity Intrusion Detection (Sections 23, 24, 72)
  const foreignEntities = inspection?.foreignEntities || [];
  for (const fe of foreignEntities) {
    const feLower = fe.toLowerCase();
    const isTopicRelevant = topicTarget.includes(feLower) ||
      (visibleNeed?.requiredEntities || []).some(e => e.toLowerCase().includes(feLower));

    // Specific contextual domain exemptions:
    const isNvidiaContext = feLower.includes('nvidia') && /nvidia|ai\s+chip|semiconductor|gpu\s+market|graphics\s+card/i.test(topicTarget);
    const isToyotaContext = feLower.includes('toyota') && /toyota|automobile|car\s+industry|sedan|vehicle/i.test(topicTarget);
    const isCurrencyContext = (feLower.includes('currency') || feLower.includes('banknote') || feLower.includes('rupee')) && /currency|money|financial|rupee|economy|bank/i.test(topicTarget);
    const isHardwareContext = (feLower.includes('motherboard') || feLower.includes('guitar')) && /hardware|guitar|audio\s+gear|pc\s+component/i.test(topicTarget);

    if (!isTopicRelevant && !isNvidiaContext && !isToyotaContext && !isCurrencyContext && !isHardwareContext) {
      return {
        classification: 'WRONG',
        subjectMatch: 0.05,
        actionMatch: 0.05,
        environmentMatch: 0.05,
        objectMatch: 0.05,
        meaningMatch: 0.05,
        evidenceMatch: 0.05,
        semanticDistance: 0.96,
        confidence: 0.95,
        foreignEntities: [fe],
        reasons: [`foreign_entity_intrusion: recognizable entity "${fe}" is not supported by video topic or narrative context`],
        accept: false,
      };
    }
  }

  // 3. Generic office / scientist stock penalty
  const isSpecificTechnicalAction = /database|sql|deadlock|concurrency|mutex|thread|backend|acid|jet\s+engine|turbine|combustor|quantum|tunneling|silicon|transistor|compiler|http|browser|server|network|devtools|request|tcp|dom|shader|gpu|lithography|parallel\s+universe|multiverse|timeline|paradox/i.test(topicTarget);
  const isGenericOfficeStock = /smiling\s+team|office\s+meeting|handshake|businesspeople\s+around\s+laptop|coworkers\s+laughing|corporate\s+business\s+team/i.test(candidateText);
  const isGenericScientistClipboard = /scientist\s+with\s+clipboard|smiling\s+scientist\s+pointing|generic\s+laboratory\s+glassware|holding\s+test\s+tube|beaker|flask|chemistry|bubbling\s+liquid/i.test(candidateText);

  if (isSpecificTechnicalAction && isGenericOfficeStock) {
    return {
      classification: 'WRONG',
      subjectMatch: 0.10,
      actionMatch: 0.10,
      environmentMatch: 0.15,
      objectMatch: 0.10,
      meaningMatch: 0.10,
      evidenceMatch: 0.10,
      semanticDistance: 0.92,
      confidence: 0.90,
      reasons: ['generic_stock_for_specific_action: generic office stock does not show specific technical/engineering operation'],
      accept: false,
    };
  }

  if (isSpecificTechnicalAction && isGenericScientistClipboard && /quantum|silicon|turbine|jet\s+engine|parallel\s+universe|multiverse|timeline|paradox/i.test(topicTarget)) {
    return {
      classification: 'WRONG',
      subjectMatch: 0.18,
      actionMatch: 0.12,
      environmentMatch: 0.25,
      objectMatch: 0.15,
      meaningMatch: 0.20,
      evidenceMatch: 0.15,
      semanticDistance: 0.85,
      confidence: 0.85,
      reasons: ['generic_stock_for_specific_action: generic scientist with clipboard or chemistry glassware does not represent deep physical/cosmological mechanism'],
      accept: false,
    };
  }

  // 4. Stage B comparison using actual VisualInspection
  const comparison = compareVisualToNeed(inspection, visibleNeed);

  // Deliberate asset reuse from run memory (maintaining established narrative continuity)
  if (candidate.isDeliberateReuse) {
    return {
      classification: 'CONTEXTUAL',
      subjectMatch: Math.max(0.60, comparison.subjectMatch),
      actionMatch: comparison.actionMatch,
      environmentMatch: Math.max(0.60, comparison.environmentMatch),
      objectMatch: comparison.objectMatch,
      meaningMatch: 0.65,
      evidenceMatch: 0.50,
      semanticDistance: 0.30,
      confidence: 0.80,
      reasons: [candidate.deliberateReuseReason || 'deliberate asset reuse maintaining established narrative continuity'],
      accept: true,
      comparison,
    };
  }

  // Recalibrate False DIRECT Examples (Sections 12-17, 26, 27, 49-56):
  // - clock for generic time travel -> CONTEXTUAL or METAPHORICAL
  // - branching optical fiber for multiverse branching -> METAPHORICAL
  // - botanical tree branch for branching timeline -> METAPHORICAL
  // - generic scientist for specific theoretical concepts -> CONTEXTUAL
  // - mechanical lock for "attempts always fail" -> METAPHORICAL
  // - no-entry traffic sign for self-consistency -> METAPHORICAL
  // - video editing UI / split screen -> NEVER DIRECT for branching timelines
  const isClockForTimeTravel = /clock|watch|pendulum|hourglass/i.test(candidateText) && /time\s+travel|grandfather\s+paradox|timeline/i.test(topicTarget) && !/clock|watch|hourglass/i.test(narration);
  const isFiberForMultiverse = /optic\s+fiber|cable/i.test(candidateText) && /multiverse|branching\s+timeline/i.test(topicTarget);
  const isTreeBranchForTimeline = /tree\s+branch|bare\s+branches|twigs|foliage/i.test(candidateText) && /timeline|reality|branching|multiverse/i.test(topicTarget);
  const isGenericPhysicist = /physicist|researcher|scientist|laboratory\s+coat/i.test(candidateText) && !/beaker|flask|chemistry|bubbling/i.test(candidateText) && /quantum|paradox|relativity|branching\s+timeline/i.test(topicTarget) && !/scientist|researcher|physicist/i.test(narration);
  const isLockForFailure = /lock|padlock/i.test(candidateText) && /attempt|fail|prohibit/i.test(topicTarget);
  const isNoEntrySignForPhysics = /no[\s-]entry|traffic\s+sign|stop\s+sign|road\s+sign/i.test(candidateText) && /self[\s-]consistency|novikov|causal\s+loop|paradox\s+barrier|prohibit/i.test(topicTarget);
  const isVideoEditorForTimeline = /filmora|video\s+editor|split\s+screen\s+effect|editing\s+timeline|premiere/i.test(candidateText) && /timeline|branch|reality/i.test(topicTarget);

  // Authentic DIRECT Visualizations:
  const isFamilyTreeForLineage = /family\s+tree|genealogy|lineage|ancestry/i.test(candidateText) && /family|lineage|grandfather|grandparent|ancest/i.test(topicTarget);
  const isTimelineBranchingVisualization = /branching\s+timeline|timeline\s+split|parallel\s+world|diverging\s+timeline|spacetime\s+divergence|two\s+realities\s+diverging/i.test(candidateText) && /timeline|branch|reality|parallel/i.test(topicTarget) && !isVideoEditorForTimeline && !isTreeBranchForTimeline;

  if (isFamilyTreeForLineage) {
    return {
      classification: 'DIRECT',
      subjectMatch: 0.95,
      actionMatch: 0.85,
      environmentMatch: 0.80,
      objectMatch: 0.95,
      meaningMatch: 0.95,
      evidenceMatch: 0.95,
      semanticDistance: 0.10,
      confidence: 0.95,
      reasons: ['family genealogy/tree directly proves ancestral lineage relationship'],
      accept: true,
      comparison,
    };
  }

  if (isTimelineBranchingVisualization) {
    return {
      classification: 'DIRECT',
      subjectMatch: 0.95,
      actionMatch: 0.90,
      environmentMatch: 0.85,
      objectMatch: 0.90,
      meaningMatch: 0.95,
      evidenceMatch: 0.90,
      semanticDistance: 0.12,
      confidence: 0.95,
      reasons: ['diverging timeline visualization directly demonstrates branching realities'],
      accept: true,
      comparison,
    };
  }

  // Authentic Documentary / Real Entity Match:
  const isDocEntitySource = candidate.providerId === 'wikipedia' || candidate.providerId === 'commons' || candidate.provider === 'wikipedia' || candidate.provider === 'commons';
  const isRealPhotoOrVideoSource = isDocEntitySource
    || ['pexels-image', 'pexels-video', 'pixabay-image', 'brave-image', 'local-bank'].includes(candidate.providerId)
    || ['pexels-image', 'pexels-video', 'pixabay-image', 'brave-image', 'local-bank'].includes(candidate.provider);
  const docEntities = [
    ...(visibleNeed?.requiredEntities || []),
    ...(visibleNeed?.visualProposition?.requiredVisibleEntities || []),
    ...(visibleNeed?.entities || []),
    ...(visibleNeed?.subject ? [visibleNeed.subject] : []),
    ...(visibleNeed?.primaryConcept ? [visibleNeed.primaryConcept] : []),
  ];
  let matchedDocEntity = null;
  const matchesDocEntity = isRealPhotoOrVideoSource && docEntities.some((ent) => {
    if (!ent || typeof ent !== 'string') return false;
    const eTokens = ent.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (eTokens.length > 0 && eTokens.every((t) => candidateText.toLowerCase().includes(t))) {
      matchedDocEntity = ent;
      return true;
    }
    return false;
  });
  if (isRealPhotoOrVideoSource && matchesDocEntity) {
    const isPrimaryDoc = isDocEntitySource;
    return {
      classification: 'DIRECT',
      subjectMatch: Math.max(isPrimaryDoc ? 0.95 : 0.92, comparison.subjectMatch),
      actionMatch: comparison.actionMatch,
      environmentMatch: Math.max(isPrimaryDoc ? 0.85 : 0.82, comparison.environmentMatch),
      objectMatch: Math.max(isPrimaryDoc ? 0.90 : 0.88, comparison.objectMatch),
      meaningMatch: isPrimaryDoc ? 0.95 : 0.92,
      evidenceMatch: isPrimaryDoc ? 0.95 : 0.88,
      semanticDistance: isPrimaryDoc ? 0.10 : 0.12,
      confidence: isPrimaryDoc ? 0.95 : 0.92,
      reasons: [`authentic real visual for "${matchedDocEntity || 'entity'}"`],
      accept: true,
      comparison,
    };
  }

  // Authentic Document / Report Representation Match:
  const isDocumentNeed = visibleNeed?.visualProposition?.conceptSense === 'DOCUMENT'
    || visibleNeed?.visualProposition?.representationNeed === 'DOCUMENT'
    || /\b(?:document|report|paperwork|contract|study|record|publication)\b/i.test(visibleNeed?.primaryConcept || visibleNeed?.subject || '');
  const isDocumentVisual = /\b(?:document|documents|paperwork|contract|report|paper|papers|binder|folder|notebook)\b/i.test(candidateText)
    || (inspection?.visibleObjects || []).some((o) => /\b(?:document|paperwork|contract|report|paper|book)\b/i.test(o))
    || inspection?.levels?.level3?.topClass === 'books, paperwork, documents, or contracts on a desk or table';

  if (isDocumentNeed && isDocumentVisual) {
    return {
      classification: 'DIRECT',
      subjectMatch: Math.max(0.85, comparison.subjectMatch),
      actionMatch: comparison.actionMatch,
      environmentMatch: Math.max(0.75, comparison.environmentMatch),
      objectMatch: Math.max(0.85, comparison.objectMatch),
      meaningMatch: 0.85,
      evidenceMatch: 0.85,
      semanticDistance: 0.15,
      confidence: 0.90,
      reasons: ['visible paperwork or document directly demonstrates authored document need'],
      accept: true,
      comparison,
    };
  }

  if (isClockForTimeTravel || isGenericPhysicist) {
    return {
      classification: 'CONTEXTUAL',
      subjectMatch: comparison.subjectMatch,
      actionMatch: comparison.actionMatch,
      environmentMatch: Math.max(0.60, comparison.environmentMatch),
      objectMatch: comparison.objectMatch,
      meaningMatch: 0.65,
      evidenceMatch: Math.min(0.40, comparison.evidenceMatch),
      semanticDistance: 0.38,
      confidence: Math.max(0.75, Number(inspection.confidence) || 0.75),
      reasons: ['contextually valid thematic/domain element (recalibrated from false DIRECT: clock/scientist does not visually explain underlying theoretical mechanism)'],
      accept: true,
      comparison,
    };
  }

  if (isFiberForMultiverse || isLockForFailure || isTreeBranchForTimeline || isNoEntrySignForPhysics || isVideoEditorForTimeline) {
    const accepted = visibleNeed?.literalnessRequirement === 'METAPHOR_ALLOWED' || editorialMode === 'MOTIVATIONAL';
    return {
      classification: 'METAPHORICAL',
      subjectMatch: comparison.subjectMatch,
      actionMatch: comparison.actionMatch,
      environmentMatch: comparison.environmentMatch,
      objectMatch: comparison.objectMatch,
      meaningMatch: 0.45,
      evidenceMatch: 0.15,
      semanticDistance: 0.65,
      confidence: inspection.confidence || 0.65,
      reasons: [accepted ? 'symbolic analogy communicates concept metaphorically' : 'metaphorical visual rejected: explainer requires direct or authentic contextual content'],
      accept: accepted,
      comparison,
    };
  }

  // If narration is about human users using software:
  const isHumanContext = /people|users?|millions|everyone|browsing|using\s+browsers/i.test(narration);
  if (isHumanContext && /people|person|laptop|user/i.test(candidateText)) {
    return {
      classification: 'CONTEXTUAL',
      subjectMatch: Math.max(0.65, comparison.subjectMatch),
      actionMatch: comparison.actionMatch,
      environmentMatch: comparison.environmentMatch,
      objectMatch: comparison.objectMatch,
      meaningMatch: 0.80,
      evidenceMatch: comparison.evidenceMatch,
      semanticDistance: 0.25,
      confidence: inspection.confidence || 0.85,
      reasons: ['contextually valid portrayal of people using technology'],
      accept: true,
      comparison,
    };
  }

  // 5. DIRECT match — Strict Calibration (Sections 12, 13, 14)
  // DIRECT means: the actual object, action, evidence, relationship, or structure required by narration is visibly shown.
  // Never assign DIRECT just because broad topic similarity is high!
  const isExcludedFromDirect = isClockForTimeTravel || isFiberForMultiverse || isGenericPhysicist || isLockForFailure || isTreeBranchForTimeline || isNoEntrySignForPhysics || isVideoEditorForTimeline;
  const hasExplicitSubjectMatch = comparison.subjectMatch >= 0.60;
  const hasExplicitActionMatch = comparison.actionMatch >= 0.65;
  const hasExplicitObjectMatch = comparison.objectMatch >= 0.60;
  const hasExplicitEvidenceMatch = comparison.evidenceMatch >= 0.75;
  const hasStrongCombinedMatch = comparison.overallVisualMatch >= 0.65 && comparison.subjectMatch >= 0.50;

  if (!isExcludedFromDirect && (hasExplicitSubjectMatch || hasExplicitActionMatch || hasExplicitObjectMatch || hasExplicitEvidenceMatch || hasStrongCombinedMatch)) {
    return {
      classification: 'DIRECT',
      subjectMatch: comparison.subjectMatch,
      actionMatch: comparison.actionMatch,
      environmentMatch: comparison.environmentMatch,
      objectMatch: comparison.objectMatch,
      meaningMatch: comparison.meaningMatch,
      evidenceMatch: comparison.evidenceMatch,
      semanticDistance: comparison.semanticDistance,
      confidence: Math.max(0.70, Number(inspection.confidence) || comparison.overallVisualMatch),
      reasons: ['visible content directly represents narration subject and action'],
      accept: true,
      comparison,
    };
  }

  // 6. CONTEXTUAL match
  if (comparison.environmentMatch >= 0.40 || comparison.subjectMatch >= 0.30 || comparison.overallVisualMatch >= 0.35) {
    const accepted = true;
    return {
      classification: 'CONTEXTUAL',
      subjectMatch: comparison.subjectMatch,
      actionMatch: comparison.actionMatch,
      environmentMatch: comparison.environmentMatch,
      objectMatch: comparison.objectMatch,
      meaningMatch: comparison.meaningMatch,
      evidenceMatch: comparison.evidenceMatch,
      semanticDistance: Math.max(0.30, comparison.semanticDistance),
      confidence: Math.max(0.65, Number(inspection.confidence) || comparison.overallVisualMatch),
      reasons: ['supports valid context and setting'],
      accept: accepted,
      comparison,
    };
  }

  // 7. METAPHORICAL match
  const hasMetaphorWords = /symbol|abstract|concept|illustration|metaphor|light\s+bulb/i.test(candidateText);
  if (hasMetaphorWords || comparison.overallVisualMatch >= 0.20) {
    const accepted = visibleNeed?.literalnessRequirement === 'METAPHOR_ALLOWED' || editorialMode === 'MOTIVATIONAL';
    return {
      classification: 'METAPHORICAL',
      subjectMatch: comparison.subjectMatch,
      actionMatch: comparison.actionMatch,
      environmentMatch: comparison.environmentMatch,
      objectMatch: comparison.objectMatch,
      meaningMatch: 0.40,
      evidenceMatch: 0.20,
      semanticDistance: 0.65,
      confidence: Math.max(0.40, inspection.confidence || 0.60),
      reasons: [accepted ? 'metaphorical visual acceptable for artistic mode' : 'metaphorical visual rejected: explainer requires direct/contextual content'],
      accept: accepted,
      comparison,
    };
  }

  // Default: WRONG
  return {
    classification: 'WRONG',
    subjectMatch: comparison.subjectMatch,
    actionMatch: comparison.actionMatch,
    environmentMatch: comparison.environmentMatch,
    objectMatch: comparison.objectMatch,
    meaningMatch: 0.10,
    evidenceMatch: 0.10,
    semanticDistance: 0.90,
    confidence: inspection.confidence || 0.85,
    reasons: ['visible content does not correlate with narration'],
    accept: false,
    comparison,
  };
}

/**
 * Editorial Judge: Evaluates an asset candidate through Sequential Hard Semantic Gates.
 * 
 * Gate 1: Technical validity
 * Gate 2: Semantic validity (rejects ACCIDENTAL and WRONG)
 * Gate 3: Semantic confidence & format strictness
 * Gate 4: Editorial usefulness (evaluates viewerGain, specificity, distractionRisk, role-specific acceptance)
 * Gate 5: Format fitness
 * Gate 6: Crop fitness
 * Gate 7: Visual quality
 * Gate 8: Sequence fitness
 */
export function judgeAssetCandidate({
  candidate,
  inspection,
  visibleNeed,
  targetFormat = 'landscape',
  retrievalScore = null,
  editorialMode = 'TECHNICAL_EXPLAINER',
}) {
  const matchVerdict = classifyVisualMatch({ candidate, inspection, visibleNeed, editorialMode });
  const formatFitness = evaluateFormatFitness(candidate, targetFormat, visibleNeed);

  const rejectReasons = [];

  // GATE 1: Technical validity
  let gate1Pass = true;
  if (retrievalScore?.resolutionStatus === 'unusable') {
    gate1Pass = false;
    rejectReasons.push('technical_unusable_resolution');
  }

  // GATE 2: Hard Semantic Validity
  // If match classification is ACCIDENTAL or WRONG, or if accept is false: REJECT
  let gate2Pass = matchVerdict.accept && matchVerdict.classification !== 'ACCIDENTAL' && matchVerdict.classification !== 'WRONG';
  if (!gate2Pass) {
    rejectReasons.push(...matchVerdict.reasons);
  }

  // GATE 3: Semantic Confidence & Format Strictness (Sections 29, 30)
  let gate3Pass = true;
  const role = visibleNeed?.visualRole || 'CONTEXT';
  const isImportantShot = ['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF'].includes(role);
  const confidenceThreshold = isImportantShot ? 0.60 : 0.35;
  if (matchVerdict.confidence < confidenceThreshold) {
    gate3Pass = false;
    rejectReasons.push(`insufficient_semantic_confidence_for_${role.toLowerCase()}: confidence ${matchVerdict.confidence} below threshold ${confidenceThreshold}`);
  }

  // Shorts stricter semantic threshold (Section 30)
  if (targetFormat === 'shorts') {
    if (isImportantShot && matchVerdict.classification === 'METAPHORICAL') {
      gate3Pass = false;
      rejectReasons.push(`shorts_important_shot_requires_direct: ${role} shot in 9:16 Shorts requires DIRECT representation, cannot use METAPHORICAL`);
    }
  }

  // GATE 4: Editorial Usefulness (Milestone Editorial Usefulness & Quality Gating)
  const editorialUsefulness = evaluateEditorialUsefulness({
    candidate,
    inspection,
    visibleNeed,
    targetFormat,
    editorialMatch: matchVerdict,
  });

  let gate4Pass = true;
  if (editorialUsefulness.verdict === 'DISTRACTING') {
    gate4Pass = false;
    rejectReasons.push('editorial_usefulness_distracting: candidate presents high distraction risk or unrelated text/branding');
  } else if (!editorialUsefulness.rolePass) {
    gate4Pass = false;
    rejectReasons.push(`role_specific_usefulness_failure_for_${role.toLowerCase()}: ${editorialUsefulness.reasons.join('; ')}`);
  } else if (isImportantShot && editorialUsefulness.verdict === 'WEAK') {
    gate4Pass = false;
    rejectReasons.push(`critical_shot_rejects_weak_usefulness: ${role} shot requires STRONG or USEFUL visual, cannot accept WEAK`);
  } else if (editorialUsefulness.distractionRisk >= 0.60) {
    gate4Pass = false;
    rejectReasons.push(`high_distraction_risk: distraction risk ${editorialUsefulness.distractionRisk} exceeds threshold 0.60`);
  }

  // GATE 5 & 6: Format & Crop Fitness
  let gate56Pass = !formatFitness.reject;
  if (formatFitness.reject) {
    rejectReasons.push(...formatFitness.rejectReasons);
  }

  // If target is landscape and asset is portrait, check if portrait leakage occurs
  if (targetFormat === 'landscape' && formatFitness.orientation === 'portrait') {
    if (formatFitness.reject || (candidate.width && candidate.width < 640)) {
      gate56Pass = false;
      rejectReasons.push('portrait_asset_rejected_for_landscape');
    }
  }

  // Sequential Hard Gate Decision:
  const isAccepted = gate1Pass && gate2Pass && gate3Pass && gate4Pass && gate56Pass;

  // Scoring
  let semanticWeight = 0;
  if (matchVerdict.classification === 'DIRECT') semanticWeight = 95;
  else if (matchVerdict.classification === 'CONTEXTUAL') semanticWeight = 75;
  else if (matchVerdict.classification === 'METAPHORICAL') semanticWeight = 40;
  else semanticWeight = 5;

  const visualMatchScore = Math.round((matchVerdict.comparison?.overallVisualMatch || 0.5) * 100);
  const formatScore = formatFitness.score || 50;
  const communicationScore = Math.round(editorialUsefulness.communicationValue * 100);
  const specificityScore = Math.round(editorialUsefulness.specificity * 100);

  const finalEditorialScore = !isAccepted ? 0 : Number((
    semanticWeight * 0.35 +
    communicationScore * 0.25 +
    specificityScore * 0.15 +
    visualMatchScore * 0.15 +
    formatScore * 0.10
  ).toFixed(2)) / 100;

  // Persistence of selection explanation
  const selectionReason = isAccepted
    ? `Accepted as ${matchVerdict.classification} match (${editorialUsefulness.verdict}): ${editorialUsefulness.viewerGain || matchVerdict.reasons[0]}`
    : `Rejected: ${rejectReasons.join('; ')}`;

  const visibleMeaning = inspection.sceneSummary || `Shows ${inspection.primarySubject} in ${inspection.environment}`;
  const whyItMatchesNarration = isAccepted
    ? (editorialUsefulness.viewerGain || `Visible subject "${inspection.primarySubject}" and action "${inspection.visibleAction}" directly corroborate narration requirement "${visibleNeed?.viewerNeedsToSee || visibleNeed?.primaryConcept}".`)
    : `Visible content does not adequately support narration requirement.`;

  return {
    candidateId: candidate.id || candidate.sourceUrl || 'candidate',
    classification: matchVerdict.classification,
    accepted: isAccepted,
    rejected: !isAccepted,
    rejectReasons,
    finalEditorialScore,
    semanticDistance: matchVerdict.semanticDistance,
    confidence: matchVerdict.confidence,
    editorialMatch: matchVerdict,
    editorialUsefulness,
    formatFitness,
    selectionReason,
    visibleMeaning,
    whyItMatchesNarration,
    matchClass: matchVerdict.classification,
    usefulnessVerdict: editorialUsefulness.verdict,
    viewerGain: editorialUsefulness.viewerGain,
    specificity: editorialUsefulness.specificity,
    genericness: editorialUsefulness.genericness,
    distractionRisk: editorialUsefulness.distractionRisk,
    communicationValue: editorialUsefulness.communicationValue,
    isWeakSearchHit: editorialUsefulness.isWeakSearchHit,
    inspectionSummary: inspection.sceneSummary || inspection.summary,
    dominantSubject: inspection.primarySubject || inspection.dominantSubject,
  };
}
