// 用户说明书 / User guide —— 已经被抽离为 shared module（v788）；/guide 页与 Studio 内置帮助抽屉（InAppGuide）共用同一份字典
// 改份文案，只需要改这里，不需要在 page 里改。
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, { kicker: string; title: string; lede: string; sections: { heading: string; body: string[] }[] }> = {
  zh: {
    kicker: '鐢ㄦ埛鎸囧崡',
    title: '涓夊垎閽熺湅鎳?NEXUS 路 鍗佷簲鍒嗛挓鐜╄捣鏉?,
    lede: '杩欎笉鏄竴浠藉府鍔╂枃妗ｏ紝鏄竴鍐屽伐鍏疯鏄庝功鈥斺€斿憡璇変綘杩欓噷鐨勬瘡涓€椤硅兘鍔涙槸浠€涔堛€佹€庝箞鐢ㄣ€備腑鑻遍兘鍙紝闅忎綘鍠滄銆?,
    sections: [
      {
        heading: '鈶?杩欎釜骞冲彴鏄粈涔堬紵',
        body: [
          'NEXUS 鏄竴涓?AI Universe Studio鈥斺€旀妸浣犺鍑哄彛鐨勬兂娉曡閰嶆垚璁捐妯″瀷锛屽啀鍙樻垚鐪熺殑鍙互鎵撳紑鐨勭綉绔欍€佹父鎴忋€佽棰戜笌涓栫晫銆?,
          '鍒涘缓涓€涓」鐩?鈫?鍦?Project 閲岀敾璁捐绋?鈫?鐢?AI 杈呭姪鏀规垚浣犳兂瑕佺殑鏍峰瓙 鈫?瀵煎嚭 / 鍙戝竷 / 鐜╅噷闈㈢殑娓告垙銆?,
          '瀹冧笉鏄?AI 鍐欎唬鐮佺殑鐜╁叿"锛氭墍鏈?AI 鐨勬敼鍔ㄩ兘璧板彲鎾ら攢鐨?Command 鏍堬紱鎵€鏈夌礌鏉愰兘鏄綘椤圭洰鑷繁鐨勭礌鏉愶紱DEMO MODE 甯搁┗鎻愰啋鈥斺€旀湭鎺ョ湡 provider 涔嬪墠涓嶅亣瑁呭凡缁忚兘鍋氥€?,
        ],
      },
      {
        heading: '鈶?鏂版墜蹇€熸紨绀郝风涓€娆¤窇閫?,
        body: [
          '娉ㄥ唽 鈫?鐐?鏂板缓椤圭洰"鈫?璧蜂釜鍚嶅瓧 鈫?鑷姩杩?Studio锛堝乏鏍忛潰鏉?+ 涓ぎ鐢诲竷 + 鍙虫瑙嗗櫒锛夈€?,
          '鍦?Studio 鐢诲竷涓婇€変腑涓€涓厓绱狅紙榧犳爣鎴?Tab 閮借锛夆啋 椤舵爮鐐?鏂板缓椤?鍔犱竴椤碉紝鎴栦粠宸︽爮鎶婄粍浠舵嫋涓婃潵銆?,
          '瀵?AI 璇翠竴鍙ヨ瘽灏辫锛堜緥锛?鎶婃爣棰樻崲鎴?72px 鐨勮‖绾垮瓧"锛夆€斺€旀瘡娆?AI 浜у嚭閮芥槸涓€涓彲浠?鈱榋 鎾ら攢鐨?Command锛涙病鏈?provider 鏃跺畠涓嶅亣瑁呭仛浜嗭紝浼氭寕 DEMO MODE銆?,
          '鈱楰锛堟垨 Ctrl K锛夋墦寮€鍛戒护闈㈡澘鈥斺€旇緭鍏ラ」鐩悕鎴栦换鎰忛〉闈㈠叧閿瘝锛堝 "鍙戝竷" 鎴?"ship"锛夛紝Enter 鐩存帴璺炽€?,
          'Ctrl S锛圡ac 鈱楽锛変繚瀛橈紱鎸?"?" 閿懠鍑洪敭鐩橀€熻鍗♀€斺€旂湡瀹炴竻鍗曪紙鈱楰 闈㈡澘銆丆trl Z / Ctrl Y銆佹柟鍚戦敭寰Щ銆丼hift+鏂瑰悜閿?8px 缃戞牸銆丆trl+A 鍏ㄩ€夈€丆trl+G 缃戞牸銆丏elete 鍒犻櫎锛夈€?,
          'Ctrl G 鏄剧ず鎴栭殣钘忓榻愮綉鏍硷紱鏂瑰悜閿井绉?1px銆丼hift+鏂瑰悜閿?8px 缃戞牸銆丏elete 鍒犻櫎閫変腑銆?,
          '鍋氬畬涓€鍒囧悗鍏?Ctrl S 淇濆瓨锛屽啀鐐归《鏍?鍙戝竷"鎶婇」鐩姇杩涘箍鍦衡€斺€斿埆浜烘墠鑳藉湪 /discover 鍙戠幇瀹冿紱姝ゅ墠鍙睘浜庝綘鑷繁銆?,
          '涓嬩竴绔欙細/ship 鐪嬭繖娆′氦浠樼殑姣忔棩鏃ュ織锛涙崲鐪?provider 涔嬪悗鍚屼竴鏉℃祦姘寸嚎浜у嚭鐪熶笢瑗裤€?,
          '鍗′綇浜嗭紵鎸?? 閿涓€閬嶉€熻鍗★紝鎴栧厛鐪?/guide 閲?鈶?娓告垙鎬庝箞鐜┿€佲懁 棰濆害 & DEMO MODE銆?,
        ],
      },
      {
        heading: 'AI 鏄€庝箞鍦ㄨ繖閲岃璇濈殑锛燂紙StateGraph 灏忚锛?,
        body: [
          '閬囧埌 AI 鏀硅璁℃椂锛岃姹備細鍧愪袱鏉¤溅閬撲箣涓€锛氳溅閬?A 鐩村彂 /v1/ai/run锛涜溅閬?B 璧颁竴鏉″彲鎺ㄦ紨鐨?*鐘舵€佸浘**鈥斺€擫angGraph 鐨勬樉寮忕姸鎬佹満锛歷alidate锛堟牎楠岃緭鍏ワ級鈫?check_provider锛堟寜 modelClass 閫夋。妯″瀷锛夆啋 build_prefix锛堟嫾瑁呯ǔ瀹氬墠缂€锛屼负浜嗚 provider 鍓嶇紑缂撳瓨鎵撲腑锛夆啋 call_llm锛堢湡姝ｆ墦 gpt-6.1-terra锛夆啋 cache_read锛堝懡涓嵆璺宠繃 provider锛夆啋 parse_and_release锛堣ˉ涓佸悎娉曟€ф牎楠岋級鈫?assemble锛堢粍瑁呭绾﹀搷搴旓級銆備换浣曞け璐ョ洿閫?END鈥斺€旂粷涓嶇┖杞€?,
          '涓轰粈涔堣涓€鏉″浘鑰屼笉鏄竴鏍圭怀瀛愶紵鐘舵€佸浘鎶?AI 璋冪敤鍙樻垚涓€鏉″彲浠ユ帹婕斻€佸彲浠ユ挙閿€銆佸彲浠ュ眬閮ㄩ噸鏀剧殑娴佹按绾匡紝鑰屼笉鏄竴涓粦鐩?API銆倄-nexus-orchestration: stategraph 鏄€屼綘鍒氬垰鐪嬬殑鏄偅鏉″浘銆嶇殑鍞竴鍏紑鏍囧織锛涘搷搴斾綋涓庤溅閬?A 閫愬瓧鑺傚悓鏋勩€?,
          '鏈夋晥鏋滈獙璇侊細鍚屽瓧鑺傚墠鐩綍鐨勪竴杞簩杩炲彂锛宲refix 缂撳瓨鍛戒腑 21265/21268锛堚増99.99%锛夆€斺€斿疄鎵撳疄鐪佷笅鐨?token锛屼笉鏄紨绀烘暟瀛椼€?admin/savings锛堢鐞嗗憳 鈫?Savings锛夎兘鐪嬪埌 tokensIn 涓?cachedTokens 涓ゅ垪璐︺€?,
          '鎯虫洿娣憋紵apps/ai-service/src/ai_service/stategraph.py 鏄繖寮犲浘鐨勬枃瀛楀疄鐜扳€斺€斿彲璇绘€у嵆鍙暀鎬э紱娴嬭瘯 tests/test_stategraph.py 8 鑷傞€愪竴璇存槑 validate / check_provider / dryRun / patch 闈炴硶 鏃剁洿閫?END 鐨勫師鍥犮€?,
          '鎯充翰鎵嬫寜涓€涓嬭瘯璇曪紵/stategraph 鈥斺€?鍏紑鍙鐨?StateGraph 钀界偣椤碉細涓冧釜鑺傜偣鐨勬梾绋嬨€佸け璐ョ洿閫?END 鐨勬潯浠惰竟銆佷互鍙婁竴涓湡鍥捐瘯璺戞寜閽紙鍥哄畾 critique + dryRun + fast锛岀湡 provider銆佺湡 x-nexus-orchestration 澶淬€佺湡璁￠噺锛涘け璐ュ瀹炲睍绀?409/429/502/503锛夈€?,
          '鐢熶骇娴侀噺涔熷彲浠ヨ蛋杩欐潯杞﹂亾浜嗭細POST /api/ai/run 甯﹁姹傚ご x-nexus-orchestration: stategraph锛堟垨鏈嶅姟绔?env NEXUS_AI_ORCHESTRATION=stategraph锛夊嵆鏁存鏀硅蛋 /v1/ai/design-graph锛涘搷搴斿ご濡傚疄鍥炲０杞﹂亾锛?admin 鎸囨爣 nexus_ai_run_lane_total 璁℃暟姣忔鍒嗘祦锛涚己鐪?lane-a鈥斺€斾竴涓嫾鍐欓敊璇笉浼氭崲杞﹂亾銆?,
        ],
      },
      {
        heading: '鈶?鍔熻兘鍦板浘锛堢偣杩涘幓灏辨槸閭ｄ釜椤甸潰锛?,
        body: [
          '/discover 骞垮満锛堢儹闂?鏈€鏂? trending / 鎴戝叧娉ㄧ殑锛涗负浣犳帹鑽愶細AI 鐓т綘鑷繁鐨勫疄娴嬮槄璇?myOpens 鎺掞紱棣嗛暱鎵规敞锛歵rending 姒滃墠涓夌敱 AI 鐓т笁鏉＄湡瀹炴寚鏍囷紙娴忚/璧?璇?杞?鐑害鍒嗭級鍚勫啓涓€鍙ヤ负浠€涔堝€煎緱鎵撳紑锛屾瘡鏉″繀鍚暟瀛楋級路 /marketplace 缁勪欢/妯℃澘/璧勪骇甯傚満 路 /blocks 绉湪搴?路 /search 鍏ㄧ珯鎼滅储',
          '/studio/<project> 椤圭洰涓诲満锛氱敾甯?鍥惧眰/璁捐绯荤粺/3D 路 /world/<id> 璧拌繘杩欎釜涓栫晫锛?D 姝ヨ锛壜?/world/<id>/digest 涓栫晫閫熻 路 /world/<id>/integrity 涓栫晫浣撴 路 /world/<id>/tide 涓栫晫娼睈 路 /world/<id>/almanac 涓栫晫骞撮壌 路 /world/<id>/constellation 浜虹墿鍏崇郴鏄熷浘 路 /world/<id>/codex 璁惧畾闆嗭紙绾搁潰鎶曞奖锛壜?/world/<id>/chronicle 缂栧勾 路 /world/<id>/ephemeris 涓栫晫鍒囩墖',
          '/bible 鍏哥睄瀹わ細姝ｅ吀绮捐 鈫?銆婃疆姹愭暀鍥€嬪崄涓夌珷 + 浜屽崄鍥炲搷锛?bible/search 鐩磋揪锛堟鍏告湰鍦版绱級路 /bible/quiz 娼睈鎸戞垬锛堟鍏搁棶绛旓級路 /bible/well 涓冨彛浜曪紙鍏哥睄瀹ょ浜屼釜鐜╂硶锛?,
          '/bible 鏀跺綍绗笁绉嶇帺娉曪細/bible/anchors 閿氬彞鍥炴斁鈥斺€?81 鍙ヤ腑鑻遍敋鍙ラ€愬瓧鍥炴斁锛屾姠绛斿畠鍑鸿嚜鍝竴绔狅紙杩炲 / 鍘嗗彶鏈€浣虫湰鍦拌锛?,
          '/n/<handle>/<slug> 鍏紑椤碉紙璁垮绗竴鐪肩湅鍒扮殑鏄繖涓€鐗堬級路 /preview/<project> 鍚屾簮鍙闀滃ご锛堝彂甯冨墠鍚屼竴鎺掓柇鐐逛笌缂╂斁锛?,
          '/tasks 浠诲姟璐︽湰锛堟瘡娆?AI 璇锋眰涓€琛岋紝鍚鍑犳銆佺湡/DEMO銆佺敤閲忋€佺敤鏃讹級路 /credits 鎴戠殑棰濆害锛圫avingsCard锛氱紦瀛樻浛浣犵渷涓嬬殑閲嶅璁＄畻锛壜?/api-tokens API 浠ょ墝 路 /analytics 鎴戜綔鍝佺殑鏁版嵁 路 /pulse 瑙傛祴澶у巺锛堝钩鍙拌仛鍚堝尶鍚嶇粺璁★紝鍙ｄ护 123锛壜?/notifications 鏀朵欢绠?路 /ship 浜や粯鏃ュ織 路 /about-nexus 鍏充簬',
          '/admin/* 骞冲彴绠＄悊鍙帮紙role=admin锛夛細瀹℃牳鍙般€乸ricing銆乨ead-letter銆乤i-cache銆乤udit銆乷bservability銆乽sers銆乸ricing銆乺ate-limit 绛?,
          '/admin/observe 鍙瑙傚療绔欙紙鍙ｄ护 123 路 鍙ｄ护鍏紑锛夛細鐪嬪钩鍙版墍鏈夌敤鎴风殑鐪熷疄琛屼负鈥斺€旀敞鍐屻€佹墦寮€銆佺偣璧炪€佽瘎璁恒€佹敹钘忋€佷换鍔＄粨灞€銆佸椁愬垎甯冦€? 澶╂墦寮€瓒嬪娍鍥句笌涓嬭瑙勫垯寤鸿锛涖€孉I 娣辫銆嶆寜閽紙gpt-6.1-terra锛岃緭鍑哄繀鍚暟瀛楋紝鍚﹀垯鏈嶅姟鍣ㄥ師鏍锋嫆缁濆睍绀猴級/admin 閲屼篃鎽嗙潃銆岃瀵熺珯銆嶅叆鍙ｄ笌鐩撮€氶摼',
        ],
      },
      {
        heading: '鈶?娓告垙鎬庝箞鐜?,
        body: [
          '鍔ㄤ綔闈紙/game/<id>锛夛細WASD 鎴栨柟鍚戦敭绉诲姩锛涚┖鏍兼敾鍑伙紱鍙充笂瑙?HUD 浼氬疄鏃舵樉绀?鐢熷懡銆佹椂闂淬€佸満涓婃晫浜烘暟銆佹嬀鍙栬鏁帮紙鐗╁搧 x/y锛夈€佸彂鐜伴噺 涓?婵€娲婚噺鈥斺€旀妸涓€寮犲浘瀹屾暣璧板畬鍐嶇湅缁撶畻銆?,
          '澶辫触浜嗗氨閲嶆潵锛氬け璐ョ殑缁撴灉鐢婚潰涓娿€岄噸鏂板紑濮嬨€嶆寜閽彲浠ヤ竴閿噸寮€锛岄敭鐩樹笂涔熺粦浜嗙┖鏍奸敭锛涙瘡涓€灞€鍥哄畾銆佹鏌ョ偣涓嶈法鐩樸€?,
          '涓嬩竴娈电殑鏁屼汉甯冨眬鐢辨父鎴忚璁＄郴缁燂紙@nexus/game-model锛夋帴涓婁竴灞€鐨勮惤鐐瑰喅瀹氣€斺€斾綘璧板埌鍝噷銆佹病璧板埌鍝噷锛屼笅涓€鐩樼殑鏁屼汉灏辨寜閭ｄ釜鍧愭爣闀垮嚭鏉ャ€?,
          'RPG 鍐掗櫓锛?game/<id>?view=rpg锛夛細WASD/鏂瑰悜閿蛋锛岄潬杩?NPC 鎸夌┖鏍?Enter 寮€濮嬪璇濓紱涓婁笅绠ご閫夐€夐」銆佺┖鏍肩‘璁わ紱瀵硅瘽鐨勫喅瀹氫細鍐欒繘浣犵殑涓栫晫妗ｆ銆?,
          '杩欎簺娓告垙鏄」鐩嚜宸遍暱鍑烘潵鐨勶細妫嬬洏銆佹晫浜恒€佹暟鍊煎叏鏉ヨ嚜浣犻」鐩噷鐨勮璁＄郴缁?瑙掕壊锛屾病鏈?鐪嬩环鐩〃瀹氭鐨勬垚鍝?鈥斺€擲tudio 閲屾敼鏁帮紝涓嬩竴鐩樺氨鎸夋柊鏁拌窇銆?,
          '鍏哥睄瀹ら噷涔熸敹鐫€娓告垙锛?bible/quiz 娼睈鎸戞垬锛堟鍏搁棶绛旓紝绛斿鐐逛寒璺爣锛変笌 /bible/well 涓冨彛浜曪紙鍑嚎绱㈡壘鍥炲け钀界殑涓冨彛浜曪級鈥斺€旇 鈶?,
          '璇氬疄璇存槑涔︼細娓告垙鏈綋娌℃湁浜戝瓨妗ｃ€佹病鏈夎嚜鍔ㄤ繚瀛樼偣鈥斺€旀瘡涓€灞€鐙珛缁撶畻锛屼氦浜嗗嵎灏辨病鏈変笅涓€鐩樼户鎵夸綘鐨?HP銆?,
        ],
      },
      {
        heading: '鈶?棰濆害 & DEMO MODE 鏄粈涔堬紵',
        body: [
          '姣忎釜鍏嶈垂璐︽埛姣忔湀鏈?AI 棰濆害銆傜湡鐢?wkapi.pro 涓婄殑 gpt-6-sol 杩欑被鐪?provider 浼氭墸鐪熼搴︼紱娌￠厤鐪?provider 鏃朵細鏄剧ず DEMO MODE 鏍囪瘑鈥斺€旂郴缁熶粛鐒惰兘璧伴€氭祦绋嬶紝鍙槸鍑虹殑涓滆タ鏄‘瀹氭€фā鎷熷嚭鏉ョ殑"鐪嬭捣鏉ュ儚 AI 鍋氱殑涓滆タ"锛屼笉鏄湡妯″瀷鐨勪綔鍝併€?,
          '/credits 椤甸潰鍙互瀹炴椂鐪嬫秷璐硅处鍗曪細姣忔 AI 璋冪敤閮借 token in/out/model/latency/cost鈥斺€斾换浣曚竴绗旈兘鏄湡鐨勬暟瀛楋紝涓嶆槸婕斿嚭鏉ョ殑锛涜处鏈噷鐨?SavingsCard 浼氭妸"缂撳瓨鏇夸綘鐪佷笅鐨勯噸澶嶈绠?鎽婄粰浣犵湅锛堝懡涓巼銆佽緭鍏?token 澶嶇敤銆佺湡妯″瀷/DEMO 杞鍒嗗緱娓咃級銆?,
          '鐪嬪埌"缂撳瓨鍛戒腑鐜?杩欎釜璇嶏細瀹冨弽鏄?provider 绔殑 prefix cache 澶嶇敤鐜団€斺€斿悓涓€涓墠缂€鐨勪笅涓€娆¤皟鐢ㄥ鏋滃懡涓簡锛屽氨鍏嶈垂灏戞暟 token锛涗笉鍛戒腑涔熶笉璇佹槑浣犲仛閿欎簡锛屽彧璇佹槑鍒嗗竷鍣ㄦ妸浣犵殑璇锋眰鏀惧埌浜嗕竴涓柊鍒嗙墖銆?,
        ],
      },
      {
        heading: '鈶?甯歌闂瓟',
        body: [
          'Q锛氫负浠€涔堟垜鎸変簡涓寜閽紝鏁撮〉绌虹櫧浜嗭紵A锛氳繖鏄?DEMO MODE 鐨勭壒鎬р€斺€旀湭閰嶇疆 provider 鏃讹紝鐢熸垚璺緞涓嶅啓鐪熷疄浠ｇ爜锛涚瓑鍒颁綘鍦ㄧ幆澧冨彉閲忛噷閰嶇疆濂界湡瀹?provider 骞惰窇閫氱涓€娆＄湡瀹炶皟鐢紝閭ｄ簺椤靛氨"浜?浜嗐€?,
          'Q锛氱紦瀛樺懡涓巼浣庢槸鎴戠殑闂鍚楋紵A锛氫笉鏄€斺€斾綘鍦ㄧ湅鐨勬槸 provider 绔殑 KV 鍒嗗竷鐗囧垎閰嶏紱鎶婂悓涓€ lane 鎵撴弧 6鈥?0 娆″ぇ姒傜巼鍑虹幇 1 娆℃湭鍛戒腑锛涘彲浠ュ湪 /admin/ai-cache锛坅dmin锛夌湅鑷繁鐨勪娇鐢ㄨ处銆?,
          'Q锛氭€庝箞璁╁埆浜虹湅鍒版垜鐨勪綔鍝侊紵A锛氶《鏍忓彂甯冣啋濉爣棰樷啋鍙戝竷锛涘彂甯冨悗鑷姩杩涘箍鍦?甯傚満锛涘彂甯冨墠浣滃搧鏄瀵嗙殑銆?,
          'Q锛氭暟鎹畨鍏ㄥ悧锛烝锛氭墍鏈?AI 鏀瑰姩閮借繘瀹¤璐︽湰銆佸彲鎾ら攢 Command锛涘叕寮€浣滃搧闅忔椂鍙挙鍥炪€?,
        ],
      },
      {
        heading: '鈶?鍒嗛暅鎬庝箞鐜╋紙Storyboard锛屄?0鈥撀?2锛?,
        body: [
          '鎵撳紑 Studio 搴曢儴鐨勩€屽垎闀溿€峊ab 鈫?鍐欎竴鍙ヨ瘽銆佺偣銆屽垏涓€鐗堝垎闀溿€嶁€斺€旇繖鏄湰鍦扮‘瀹氭€ф柇鍙ワ紙鎸夋爣鐐瑰垏鎴愰暅澶磋〃锛夛紝涓嶆槸 AI 鍒嗛暅锛沺rovider 鏈帴鍏ュ墠涓嶅仛鍋囩敓鎴愩€?,
          '闀滃ご琛屽彲鏀癸細鏃堕暱锛堟绉掞級銆佹満浣嶏紙瀹芥櫙/涓櫙/鐗瑰啓/缁嗛儴/璺熺Щ/鑸媿锛夈€佽浆鍦猴紙纭垏/娣″叆/鍙犲寲/鍒掑儚锛夛紱鐐广€孌EMO 鍙傝€冨浘銆嶄负鏈暅鍚堟垚涓€寮犲弬鑰冨抚鈥斺€斿儚绱犳潵鑷湰鍦扮‘瀹氭€у悎鎴愬櫒锛屼笉鏄?AI 鍑哄浘锛涙挙閿€鍙柇寮€寮曠敤銆佷笉鍒犺祫浜с€?,
          '銆孌EMO 娓叉煋鏁存潯鍒嗛暅銆嶄細鎶婃暣鏉″垎闀滄覆鎴愪竴鏉?mp4 骞舵寕鍥炵涓€闀滐細鐪?ffmpeg銆佺湡棰濆害闂ㄣ€佺湡瑙嗛鎽勫叆闂紝鎴愮墖涓?DEMO锛堟湰鍦版帹婕旓紝涓嶆槸 AI 鐢熸垚锛夛紝鎸夐挳澶勬槑鐮佹爣娉ㄣ€?,
          '鏃堕棿绾垮彲鐩存帴缂栬緫锛氭嫋鍙宠竟缂樻敼闀垮害锛堝惛闄?100ms銆佷笅闄?200ms锛夈€佹嫋鏁村潡鎹綅銆佸弻鍑讳竴鏍煎湪鐐瑰嚮澶勫垏鎴愪袱闀滐紱閿洏 Tab 鍒版牸瀛愮殑鍙宠竟缂樸€佹柟鍚戦敭璋冩暣锛圫hift 涓€妗?500ms锛夛紝Enter 钀藉簱銆丒sc 鍙栨秷鈥斺€斿洓鏉¤矾鏀圭殑鏄悓涓€浠芥ā鍨嬶紝鍏ㄧ▼鍙挙閿€銆?,
        ],
      },
      {
        heading: '鈶?璧拌繘涓€涓笘鐣岀帺锛圵orld锛?,
        body: [
          '/world/<id> 杩涘叆 3D 璧板姩瑙嗚锛歐ASD 鎴栨柟鍚戦敭绉诲姩锛涙寜浣忛紶鏍囧乏閿嫋鎷藉彲浠ョ幆瑙嗗洓鍛紙鍚戜笂鎷?= 寰€涓婄湅锛夛紱闈犺繎 NPC 鍚庢寜瑙掕壊鏃佸嚭鐜扮殑銆岃窡瑙掕壊璇磋瘽銆嶅叆鍙ｅ璇濄€?,
          '/world/<id>/chronicle 缂栧勾鍙诧細鏁呬簨/鍘嗗彶鏉＄洰鎸夌邯鍏冩帓寮€锛堢伆鐏邯/鐏扮儸绾?閾佹湀绾€︹€︿綘椤圭洰鑷繁鐨勭邯鍏冨悕锛夛紝浜虹墿鏄熷浘 鈫?缂栧勾浜掔浉鐐逛寒锛涙潯鐩彲鎸傘€岃蹇嗗洖澹般€嶁€斺€旂函鎰熷畼鍒荤棔锛屸墹 240 瀛楋紝涓嶆槸姊楁銆?,
          '/world/<id>/digest 涓栫晫閫熻 路 /world/<id>/integrity 涓栫晫浣撴锛堝彧鎶ョ湡闂锛氱邯鍏冮敊浣?鍥炲０缂哄け/瀛ゅ効鏉＄洰锛屼笉鎵撳垎涓嶅亣缁匡級路 /world/<id>/tide 涓栫晫娼睈 路 /world/<id>/ephemeris 涓栫晫鏃ュ巻鎶曞奖 路 /world/<id>/codex 璁惧畾闆?路 /world/<id>/constellation 浜虹墿鍏崇郴鏄熷浘銆?,
          '杩欎簺椤甸潰鍏ㄩ儴鏄綘鐨勯」鐩暟鎹殑鎶曞奖鈥斺€斾笘鐣岄〉涓嶆槸"瀹樻柟鏁呬簨"锛屾槸浣犵敾鐨勪笘鐣岃嚜宸辩殑缁撴瀯銆?,
          '鎯宠杩欎釜瀹囧畽鐨勬鍏告枃瀛楋紵鍘?/bible 缈汇€婃疆姹愭暀鍥€嬪崄涓夌珷 + 浜屽崄鍥炲搷鈥斺€旈敋鍙ヤ腑鑻卞瓧瀛楀榻愮殑姝ｅ吀銆佸彲浠ョ洿鎺ユ敹钘忕殑鍏哥睄瀹ゃ€?,
        ],
      },
      {
        heading: '鈶?甯傚満銆侀個璇蜂笌鍥㈤槦',
        body: [
          '/marketplace 缁勪欢甯傚満锛氭祻瑙堜綔鑰呮寕鐗岀殑涓滆タ銆佺湅璋佷拱杩囥€佷拱涓嬫垨閫€璐э紱甯傚満閲屽崠鐨勪笢瑗挎瘡涓€浠堕兘鏈夌湡瀹炵粨绠楄矾寰勩€傞《閮ㄧ殑銆孉I 閫夊搧銆嶄細璁╁ぇ妯″瀷璇昏揣鏋跺墠涓変欢鐨勫疄娴嬪瓧娈碉紙浠锋牸 / 涓嬭浇閲忥級锛屽悇鍐欎竴鍙ヤ负浠€涔堝€煎緱鐪嬧€斺€斾环鏍间笌涓嬭浇閲忛兘鏄湡鐨勶紝浣滃搧璐ㄩ噺妯″瀷涓嶇銆?,
          '/invites/<token> 鎺ュ彈闃熶紞閭€璇凤細椤圭洰鎴愬憳浠?Studio 鐨?Team 闈㈡澘鍙戝嚭閭€璇烽摼鎺ワ紝鎺ュ彈鍚庢垚涓哄崗浣滆€咃紙甯綅鏈変笂闄愶紱杩囨湡閭€璇蜂笉鍐嶅崰甯級銆?,
          '/api-tokens 鑷缓鏈哄櫒浜猴細缁?CI/鑴氭湰涓€鏋氫护鐗岋紝灏辫兘鐢ㄧ▼搴忓寲鏂瑰紡璇诲啓浣犵殑鍐呭涓庝綔鍝侊紱/tasks 閲岃兘鐪嬪埌姣忎釜浜戠浠诲姟鐨勭湡瀹炴帓闃熶笌鐘舵€併€?,
          '/ship 姣忔棩浜や粯鏃ュ織锛圓I 骞冲彴閫熻锛氬ぇ妯″瀷鐓х湡瀹?git log 鏈烘缁熻鍐欎袱娈佃瘽鈥斺€? 澶?90 娆℃彁浜ゃ€乫eat 47/fix 20/docs 12/merge 6/test 5/328 ADR 涔嬬被鐨勬暟瀛楅兘鏄湡鐨勶紝鏂囧瓧鏄畠鍐欑殑锛壜?/notifications 鏀朵欢绠憋紙AI 鍏堣涓€涓嬶細妯″瀷鍙湅鎸夌被鍨嬭仛鍚堢殑瀹炴祴璁℃暟鈥斺€旂瓑浣犵粨璁虹殑 moderation/approval/team 浼樺厛锛宭ike/follow 鏈€鍚庯紱鏍囬 / 姝ｆ枃涓€涓瓧閮戒笉杩涙ā鍨嬶級路 /analytics 浣犵殑浣滃搧鏁版嵁 路 /pulse 瑙傛祴澶у巺锛堝钩鍙板叏绔欒仛鍚堝尶鍚嶏紝鍙ｄ护 123锛壜?/observatory 鍏叡瑙傛祴澶у巺锛堝甫瑙勫垯澶栨帹棰勬祴鐨勫叕寮€鍥磋锛屽彛浠?123锛汚I 娣辫锛氳澶фā鍨嬪熀浜庡疄娴嬭仛鍚堟暟瀛楄捣鑽夊洓鏉℃寜鍙搷浣滄€ф帓搴忕殑浼樺寲寤鸿锛汚I 鐙珛澶嶆牳锛氳澶фā鍨嬫妸灞曟澘涓婄殑鏁板瓧閲嶇畻涓€閬嶏紝閫愭潯鍒?agree/disagree锛堟瘡鏉″繀鍚暟瀛楋級锛壜?/credits 浣犵殑棰濆害璐︽湰鈥斺€旀瘡涓兘鏄湡瀹炴暟鎹〉銆?,
        ],
      },
      {
        heading: '鈶?璧伴敊涓€姝ユ€庝箞璧板洖鏉?,
        body: [
          '鈱榋锛堟垨 Ctrl Z锛変竴娆℃挙閿€鏈€杩戜竴涓?Command鈥斺€斿璇濄€佺敾甯冦€佸垎闀溿€佺姸鎬佽ˉ涓併€佹柇鐐癸紝鍏ㄩ儴璧板悓涓€鏉℃挙閿€鏍堬紱閲嶅仛鏄?鈱樷嚙Z / Ctrl Y銆?,
          '鍒犻櫎绫绘搷浣滐紙鍒犻櫎椤圭洰/鎾ゅ彂甯?鍒犻暅澶达級閮芥湁浜屾纭锛涘垹鎺夌殑椤圭洰杩涘洖鏀剁珯銆佸彲浠ユ仮澶嶏紱鍏紑浣滃搧闅忔椂鍙挙鍥炲埌 private銆?,
          '鍙戝竷鍓嶆渶鍚庝竴姝ユ槸纭鍗♀€斺€旀病鐐瑰ご灏变笉浼氭姇杩涘箍鍦猴紱AI 鐨勫嵄闄╁姩浣滐紙鍒?鍙?鑺遍搴︼級鍚屾牱鏈変汉瀹￠棬锛屾病鎵瑰噯灏变笉鎵ц銆?,
        ],
      },
      {
        heading: '鈶?鍏哥睄瀹わ紙/bible锛夋€庝箞鐜?,
        body: [
          '/bible 姝ｅ吀绮捐锛氥€婃疆姹愭暀鍥€嬪崄涓夌珷 + 浜屽崄鍥炲搷鈥斺€旀瘡涓€绔犵偣寮€灏辫兘璇伙紝閿氬彞鍦ㄤ腑鑻变箣闂村瓧瀵归綈锛坺h 鍘熷瓧鑺?/ en 瀵圭収锛屼笉娣峰啓锛夈€?,
          '/bible/search 鐩磋揪锛氬湪姝ｅ吀閲屾寜鍏抽敭璇嶅仛鏈湴妫€绱紝鐩存帴璇诲嚭鍛戒腑鐨勯偅涓€娈碉紙涓嶅嚭 AI銆佷笉鍑哄簱澶栨潵婧愶紝鎱竴姝ヤ絾鏄湡妫€绱級銆?,
          '/bible/quiz 娼睈鎸戞垬锛氫互姝ｅ吀鍑洪鈥斺€旂瓟閿欏洖鍝竴绔犻噸鏂板锛岀偣浜殑璺爣鐣欏湪鏈満锛堟棤浜戝瓨妗ｏ紝鍒锋柊鐓ф棫锛夈€?,
          '/bible/well 涓冨彛浜曪細鍏哥睄瀹ょ殑绗簩涓帺娉曗€斺€旈『鐫€涓冩潯绾跨储鎵惧洖澶辫惤鐨勪竷鍙ｄ簳锛涙壘瀵逛簡灏卞紑鍑轰竴娈靛湴鏂癸紝鎵句笉鍒扮殑鐓у疄璇存壘涓嶅埌銆?,
          '/bible/whisper 绛旈棶鑰咃細鎸戜竴鍗锋鍏稿啀闂竴鍙モ€斺€斿吀绫嶉噷鏈夊啓鐨勫氨鐓у畠鍐欑殑绛旓紝娌″啓鐨勫氨鐩磋娌″啓銆傞浂鎸佷箙鍖栥€侀浂璁板繂锛屽埛鏂板氨鏄繕浜嗐€?,
          '/bible 姣忕珷鏈熬杩樻湁銆岃 AI 璇荤粰浣犲惉銆嶏細妯″瀷鍙鏈珷鍘熸枃鎽樺綍锛屼笁鍙ヨ瘽璇存竻杩欑珷锛屾渶鍚庨€掍竴鍙ユ€濊€冮锛堜笉鏇夸綘鍥炵瓟锛夛紱鍚屼竴绔?/ 鍚岃瑷€ 7 澶╁唴缂撳瓨锛屼笉閲嶅璁¤垂銆?,
          '鍥炲０锛圗choes锛夛細缁欐鍏告潯鐩寕涓€鏉＄函鎰熷畼鐨勫井鍒荤棔锛堚墹 240 瀛楋紝涓嶆槸姊楁锛夛紝瀹冭兘鍦ㄦ槦鍥句笌缂栧勾閲屼簰鐩哥偣浜€斺€旀槦鍥锯啍缂栧勾褰兼鍞ら啋銆?,
          '浠ヤ笂閮芥槸绉佹湁鐜╃殑鍦版柟锛氳涓嶉渶瑕佺櫥闄嗭紙鍙湁杩愯鏃惰鏁帮級锛涗笉鎶婁綘鐨勯€夐」钘忓湪 AI 閲屸€斺€斿畠鍙负浣犳寚鍑鸿矾鍦ㄥ摢銆?,
        ],
      },
    ],
  },
  en: {
    kicker: 'User Guide',
    title: 'Three minutes to understand NEXUS 路 Fifteen to start playing',
    lede: 'This is not just a help page 鈥?it is the manual: what every capability is, how to use it. Switch language anytime with the top-right toggle.',
    sections: [
      {
        heading: '鈶?What is this thing?',
        body: [
          'NEXUS is an AI Universe Studio 鈥?a place where your spoken intent becomes a design model, then real websites, games, videos and worlds that actually open.',
          'Create a project 鈫?lay out the design 鈫?let AI assist 鈫?export / publish / play the games inside.',
          'Not an "AI toy": every AI change goes through a revocable Command stack; every asset is yours; DEMO MODE is a standing badge 鈥?unconfigured providers are never faked as live.',
        ],
      },
      {
        heading: '鈶?New here? A 2-minute first run-through',
        body: [
          'Sign up 鈫?"New project" 鈫?give it a name 鈫?you land in Studio (left panel + canvas + right inspector).',
          'In Studio, select something on the canvas (mouse or Tab) 鈫?hit "New page" in the top bar, or drag components from the left onto the canvas.',
          'Say one sentence to the AI (e.g. "make the title 72px serif") 鈥?every AI turn lands as a Command you can undo with Cmd/Ctrl+Z; no provider configured 鈬?no pretend magic, the DEMO MODE badge shows.',
          'Press Cmd/Ctrl+K to open the command palette 鈥?type a project name or any path keyword ("publish", "ship", "tide") and Enter jumps straight there.',
          'Cmd/Ctrl+S to save; press "?" to pull the speed-cheat card on screen 鈥?the whole real list (鈱楰 palette, Ctrl+Z / Ctrl+Y, arrow nudges, Shift+arrows 8px grid, Ctrl+A select, Ctrl+G grid, Delete).',
          'Ctrl/Cmd+G toggles the alignment grid; arrow keys nudge 1px, Shift+arrows 8px, Delete removes the selection.',
          'When it is right: Cmd/Ctrl+S to save, then Publish from the top bar 鈥?your project lands on /discover; before that it stays yours alone.',
          'Next stop: /ship to see the daily delivery log; once a real provider is wired, the same pipeline produces the real stuff.',
          'Stuck? Press ? to read the cheatsheet, or jump back to section 鈶?(games) / 鈶?(quota & DEMO MODE) right here.',
        ],
      },
      {
        heading: 'How does AI "speak" here? (StateGraph in one minute)',
        body: [
          'When AI edits a design, the request takes one of two lanes: lane A directly POSTs /v1/ai/run; lane B runs it through an explicit **stateful graph** 鈥?LangGraph-style state machine: validate (input contract) 鈫?check_provider (pick model by modelClass) 鈫?build_prefix (lay down a byte-stable prefix so the provider\u2019s prefix cache fires) 鈫?call_llm (real call to gpt-6.1-terra) 鈫?cache_read (hit = skip provider) 鈫?parse_and_release (validate patch legality) 鈫?assemble (contract-checked response). Any failure short-circuits to END 鈥?nothing keeps spinning.',
          'Why a graph and not a straight line? The graph makes the AI call a pipeline you can reason about, replay and partially undo 鈥?not a black-box API. x-nexus-orchestration: stategraph is the only public tell that lane B served you; the response body is byte-identical to lane A.',
          'Measured effect: on identical byte-prefixes, back-to-back turns hit 21265/21268 cached tokens (鈮?9.99%) 鈥?real savings, not demo numbers. /admin/savings pairs tokensIn against cachedTokens side by side.',
          'Curious? apps/ai-service/src/ai_service/stategraph.py is the graph written out 鈥?readable source is the documentation; tests/test_stategraph.py walks the eight arms: why validate / check_provider / dryRun / invalid patches short-circuit straight to END.',
          'Want to press the button yourself? /stategraph 鈥?the public read-only StateGraph page: the seven-node journey, the fail-to-END conditional edges, and a live-probe button (fixed critique + dryRun + fast payload, real provider, real x-nexus-orchestration header, real metering; failures shown honestly as 409/429/502/503).',
          'Production traffic can ride this lane too: POST /api/ai/run with the header x-nexus-orchestration: stategraph (or env NEXUS_AI_ORCHESTRATION=stategraph on the server) routes the whole call through /v1/ai/design-graph. The response header echoes the lane it took and the metric nexus_ai_run_lane_total counts every split; the default is lane-a 鈥?a typo never switches lanes.',
        ],
      },
      {
        heading: '鈶?Feature map (click a path, land on the page)',
        body: [
          '/discover feed (For You: AI ranks by your own measured reading trace 鈥?myOpens 鈥?and never ranks for people without one; the curator鈥檚 note: the top-3 trending cards get one 鈥渨hy open this鈥?each, written by AI from three real metrics (views / likes / comments / remixes / heat), every line citing figures) 路 /marketplace components/templates/assets 路 /blocks library 路 /search global search',
          '/studio/<project> studio 路 /world/<id> walk this world (3D) 路 /world/<id>/digest world digest 路 /world/<id>/integrity world checkup 路 /world/<id>/tide world tide 路 /world/<id>/almanac world almanac 路 /world/<id>/constellation character graph 路 /world/<id>/codex paper tome 路 /world/<id>/chronicle timeline 路 /world/<id>/ephemeris 360-day page',
          '/bible hall of canon 鈫?銆婃疆姹愭暀鍥€?thirteen chapters + twenty echoes; /bible/search direct hits (local canon retrieval) 路 /bible/quiz Tide Challenge (canon quiz) 路 /bible/well Seven Wells (the second game)',
          '/bible gains a third game: /bible/anchors Anchor Echo 鈥?the 181 bilingual anchor sentences replayed verbatim; name the chapter or echo each line came from (streak and best kept locally)',
          '/n/<handle>/<slug> public page (what visitors see first) 路 /preview/<project> same-origin read-only lens (the same controls as visitors)',
          '/tasks task ledger (one AI request per row, with attempt count, real/DEMO badge, usage and latency) 路 /credits your quota (SavingsCard: duplicate computation the cache absorbed for you) 路 /api-tokens API tokens 路 /analytics your stats 路 /pulse the observatory hall (platform-wide aggregate, passphrase 123) 路 /notifications inbox 路 /ship ship log 路 /about-nexus about',
          '/admin/* admin console (role=admin): moderation, pricing, dead-letters, ai-cache, audit, observability, users, rate-limit, etc.',
          '/admin/observe the read-only observer (password 123 鈥?the password is public): every real user鈥檚 behavior on the platform 鈥?signups, opens, likes, comments, saves, task outcomes, plan distribution, the 7-day opens trend and rule-engine advice; the 鈥淎I deep-read鈥?button (gpt-6.1-terra 鈥?output must carry figures or the server refuses to render it); a direct link on /admin too',
        ],
      },
      {
        heading: '鈶?How games work here',
        body: [
          'Action surface (/game/<id>): WASD or arrow keys to move; Space to attack. The HUD shows health, time, live enemies, pickups (items x/y), discoveries and activations 鈥?finish the map before judging, not by health alone.',
          'Dead? Restart: the 鈥淩estart鈥?button on the outcome screen re-runs (Space also bound); runs are self-contained, no cross-run checkpoints.',
          'Next stage layout is decided by @nexus/game-model from where you ended 鈥?your previous coordinates seed the next enemy placements.',
          'RPG adventure (/game/<id>?view=rpg): WASD/arrows to walk; Space/Enter near an NPC to talk; pick options with arrows + Space; dialogue choices write into your world file (visible in the character panel).',
          'These games grow from YOUR project: boards, enemies and numbers come from your own design system/cast 鈥?not a pre-baked product; tweak numbers in Studio and the next run plays by them.',
          'The Hall of Canon ships games too: /bible/quiz (Tide Challenge 鈥?canon quizzes, lit beacons) and /bible/well (Seven Wells) 鈥?see 鈶?',
          'Honesty note: the game itself has no cloud save and no auto checkpoints 鈥?every run settles independently; once you wipe-screen out, there is no carrying HP forward.',
        ],
      },
      {
        heading: '鈶?Quota & what DEMO MODE means',
        body: [
          'Every free account has an AI quota. Real providers consume real quota; without one you see the DEMO MODE badge 鈥?the flow still completes, but the output is deterministic simulation, not a real model鈥檚 work.',
          '/credits shows the live ledger: every AI call records tokens in/out, model, latency, cost. All real numbers; SavingsCard on that page tallies how much duplicate computation the cache absorbed for you (hit rate, prompt-token reuse, real vs DEMO turns).',
          'About "cache-hit rate": it measures the provider鈥檚 prefix-KV hit rate. Same prefix sequence hitting twice means fewer tokens consumed; a miss is not proof of error 鈥?the distributor may have placed your request on a cold shard.',
        ],
      },
      {
        heading: '鈶?Frequently asked questions',
        body: [
          'Q: why did the page go blank? A: DEMO MODE short-circuit 鈥?no provider configured, so generation can鈥檛 write real code. Configure the real provider endpoint in the environment to make those pages "light up".',
          'Q: is low cache-hit-rate my fault? A: No 鈥?it鈥檚 the provider鈥檚 KV-shard lottery. Over 6鈥?0 identical prefix lanes expect ~1 cold shard; admins can see their per-lane bills at /admin/ai-cache.',
          'Q: how do others see my work? A: top-bar Publish 鈫?fill title 鈫?publish; before publishing it stays private.',
          'Q: is my data safe? A: every AI edit is in the audit ledger, revocable Command; public works recallable anytime.',
        ],
      },
      {
        heading: '鈶?How the storyboard plays (搂40鈥撀?2)',
        body: [
          'Open the 鈥淪toryboard鈥?tab at the bottom of Studio 鈫?write one sentence and press 鈥淐ut a storyboard鈥? That is local deterministic splitting by punctuation, not AI storyboarding; no fake generation before a provider is wired.',
          'Per shot you can change: duration (ms), camera (Wide/Medium/Close-up/Detail/Tracking/Aerial), transition (Cut/Fade/Dissolve/Wipe); hit 鈥淒EMO reference鈥?to compose a reference frame for the shot 鈥?pixels come from a local deterministic synthesizer, not AI output; undo only drops the link, it never deletes the asset.',
          '鈥淒EMO-render the whole storyboard鈥?renders the entire board into one mp4 attached to the first shot: real ffmpeg, real quota door, real video-ingest gate, product is DEMO (local inference, not AI generation) and is labeled as such at the button.',
          'The timeline is directly editable: drag a cell鈥檚 right edge to resize (snaps to 100 ms, minimum 200 ms), drag the block to reorder, double-click a cell to split at the click point; keyboard: Tab to the right edge, arrows nudge (Shift = 500 ms per step), Enter commits, Esc cancels 鈥?all four paths edit the same model and are undoable.',
        ],
      },
      {
        heading: '鈶?Step into a world',
        body: [
          '/world/<id> is the 3D walk view: WASD or arrow keys move; hold the left mouse button and drag to look around (drag up = look up); stand near an NPC and use the 鈥淭alk to the character鈥?entry to converse.',
          '/world/<id>/chronicle 鈥?story and history entries arranged by era (Grey-Lamp Age / Ash Age / Iron-Moon Age 鈥?whatever YOUR project鈥檚 eras are), characters and chronicle light each other up; entries can carry 鈥渕emory echoes鈥?鈥?pure sensory etchings, 鈮?240 chars, not plot summaries.',
          '/world/<id>/digest world digest 路 /world/<id>/integrity world checkup (reports real issues only: era drift, missing echoes, orphan entries 鈥?no fake scoring) 路 /world/<id>/tide world tide 路 /world/<id>/ephemeris world calendar projection 路 /world/<id>/codex the lore tome 路 /world/<id>/constellation the character graph.',
          'Every one of these pages is a projection of YOUR project 鈥?the world pages are not 鈥渢he official story鈥? they are the structure of the world you drew, rendered.',
          'Fancy the canon text of this universe? Go to /bible 鈥?thirteen chapters of the Tide Conclave plus twenty echoes, anchor sentences aligned word-for-word between Chinese and English.',
        ],
      },
      {
        heading: '鈶?Marketplace, invites and teams',
        body: [
          '/marketplace 鈥?the components bazaar: browse what authors have listed, see who bought what, buy or refund; everything listed has a real settlement path. The 鈥淎I picks鈥?strip up top has the model read measured fields of the first three shelf items (price / downloads) and write one line each on why they deserve a look 鈥?prices and download counts are real; the model never claims quality.',
          '/invites/<token> 鈥?accept a team invite: project members send invite links from the Studio Team panel; accepted collaborators hold a seat (seats are capped; expired invites stop holding one).',
          '/api-tokens 鈥?mint a token for CI/scripts to read and publish your content programmatically; /tasks shows the real queue and state of every cloud task.',
          '/ship daily delivery log (AI at-a-glance: the model writes 2-4 sentences straight from mechanically counted git-log figures 鈥?real numbers, model-written words) 路 /notifications inbox (Let AI read it first 鈥?counts-only triage: moderation/approval/team outrank likes and follows; no title or body ever reaches the model) 路 /analytics your works鈥?stats 路 /pulse the observatory hall (whole platform, aggregated & anonymous, passphrase 123) 路 /observatory the public observation hall (rule-projected, public, passphrase 123; AI deep-read: the model drafts four actionability-ranked optimization suggestions from the measured aggregates, with basis / impact / next steps; AI independent review: the model recomputes the board and rules agrees / disagrees per line (every line cites figures)) 路 /credits your quota ledger 鈥?all real data pages.',
        ],
      },
      {
        heading: '鈶?Wrong turn? Walk back',
        body: [
          '鈱榋 (or Ctrl+Z) undoes the most recent Command 鈥?chat edits, canvas, storyboard, state patches, breakpoints all run through the same undo stack; redo is 鈱樷嚙Z / Ctrl+Y.',
          'Destructive actions (delete project / unpublish / delete shot / clear selection) all carry a confirmation step; deleted projects go to the recoverable trash; public works can be recalled to private anytime.',
          'Publish鈥檚 last step is a confirmation card 鈥?nothing enters the feed without your explicit yes; dangerous AI actions (delete / publish / spend quota) are likewise human-gated and refuse to run until approved.',
        ],
      },
      {
        heading: '鈶?How the Hall of Canon works (/bible)',
        body: [
          '/bible 鈥?the canon proper: thirteen chapters of the Tide Conclave, plus twenty echoes; anchor sentences align word-for-word across zh and en.',
          '/bible/search 鈥?type a keyword, fetch the exact canon passage (pure local retrieval; no AI generation, no outside sources).',
          '/bible/quiz 鈥?the Tide Challenge: canon-aligned quizzes; wrong answers point back to the chapter to re-read; lit beacons stay on your machine (no cloud save; refresh keeps nothing).',
          '/bible/well 鈥?Seven Wells: the Hall鈥檚 second game 鈥?follow seven clues back to seven lost wells; found wells open the way; unfound wells honestly say they are not found.',
          '/bible/whisper 鈥?the Answerer: pick any chapter (or echo), ask one line; if the canon answers it answers in the chosen language; if not, it says so plainly. No persistence 鈥?refresh is silence.',
          '/bible also carries 鈥淟et AI read it to you鈥?at the end of every chapter: the model reads only an excerpt of that chapter, says it in three sentences, then hands you one question (never the answer) 鈥?cached per chapter and language for 7 days, so it never double-bills.',
          'Echoes: hang micro-sensory etchings (鈮?240 chars, not summaries) onto canon entries; they light each other up across the star-graph and the chronicle.',
          'Everything here is a private playroom: reading needs no sign-in (runtime counters only); nothing pulls you into the plot 鈥?it only points at where the road goes.',
        ],
      },
    ],
  },
};

export type GuideSection = { heading: string; body: string[] };
export type GuideCopy = Record<Locale, { kicker: string; title: string; lede: string; sections: GuideSection[] }>;
export const GUIDE_COPY: GuideCopy = COPY;
