// Re-export: keep same code as app.js but with product naming tweaks
// If you maintain only this file, you can delete app.js

// NOTE: Copied from app.js on rename to keep functionality.
// Minor tweaks: download filename prefix uses "smart_jikanwari" instead of generic.

document.addEventListener('DOMContentLoaded', () => {
    const rawDataEl = document.getElementById('rawData');
    const rowSelector = document.getElementById('row-selector');
    const colSelector = document.getElementById('col-selector');
    const tableContainer = document.getElementById('table-container');
    const cardContainer = document.getElementById('card-container');
    const tableViewBtn = document.getElementById('tableViewBtn');
    const cardViewBtn = document.getElementById('cardViewBtn');
    const saveImageButton = document.getElementById('saveImageButton');
    const shareButton = document.getElementById('shareButton');
    const showTagsCheckbox = document.getElementById('showTagsCheckbox');
    const separateVideoEtc = document.getElementById('separateVideoEtc');
    const panelToggleBtn = document.getElementById('panelToggleBtn');
    const panelBody = document.getElementById('panel-body');
    const clearDataButton = document.getElementById('clearDataButton');
    const clearPopover = document.getElementById('clearPopover');
    const clearCancelBtn = document.getElementById('clearCancelBtn');
    const clearConfirmBtn = document.getElementById('clearConfirmBtn');
    const zoomSelect = document.getElementById('zoomSelect');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    
    let scheduleData = [];
    let additionalScheduleData = [];
    let currentView = 'table';
    let selectedStudent = null;
    let selectedTimeslot = null;
    let videoInstructorByTimeslot = new Map();
    let currentZoom = 1;
    // Zoom is now controlled as percent 30-150 via a numeric input; internal scale remains 0.3-1.5
    const ZOOM_MIN = 0.3, ZOOM_MAX = 1.5;
    // Built-in default attribute choices when no data is present
    const DEFAULT_ATTRIBUTES = ['生徒情報','時限（時間）','教科','講師','タグ','メモ'];
    
    /**********************************
     文字列を受け取り、必要な文字参照を施して返す。もとの文字列がnullかundefinedの場合はから文字列を返す
    ***********************************/
    const escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;');
    };
    
    /**********************************
     生のテキストを受け取り、オブジェクトに変換して返す。オブジェクトの形式は
        {
            '生徒情報': 生徒氏名（学年）,
            '時限（時間）': 時限（時間）,
            '教科': 教科,
            '講師': 講師名または授業種別,
            'タグ': アイコンなど,
            'メモ': メモ欄,
            '学年': 生徒の学年,
        }
    ***********************************/
    const parseRawData = (text) => {
        // Remove blank/whitespace-only lines before interpretation (handles CRLF too)
        const lines = text
            .split('\n')
            .map(l => l.replace(/\r/g, ''))
            .filter(l => l.trim().length > 0);
        const schedule = [];
        const additionalSchedule = [];
        let currentTimeslot = '不明'; // 時限
        let currentTime = '不明'; // 時限の時刻範囲
        let mode = 'unknown'; // video: 映像・学トレなど, individual: 個別授業, additional: 追記
        videoInstructorByTimeslot = new Map(); // 初期化
        
        const isTimeslotLetter = (s) => /^[A-Z]$/.test(s); // 文字列が大文字のA-Z一文字であればtrueを返す（時限） cf. RegExp.prototype.test()
        const isTimeRange = (s) => /\d{1,2}:\d{2}\s*〜\s*\d{1,2}:\d{2}/.test(s); // e.g. 13:30 〜 14:30
        const isHeader = (s) => s.startsWith('時限'); // 時限    学年    生徒氏名    教科名    ｱｲｺﾝ ……
        const isSectionVideo = (s) => s.startsWith('映像・学トレなど');
        const isSectionIndividual = (s) => s.startsWith('個別授業');
        const isAdditional = (s) => (s == '追記');
        const isStudentLine = (s) => /^((小|中|高)[1-6１-６]|高卒)/.test(s);
        
        const knownIcons = ['出席', '欠席', '追加受講', '振替', 'SNET振替', '講習会', 'マンツーマン', '有効時限', '重要'];
        
        const parseVideoStudent = (line) => {
            const timeslotInfo = `${currentTimeslot}（${currentTime}）`; // 時限
            
            const parts = line.trim().split(/\s+/).filter(Boolean); // 受け取った文字列の両端の空白を取り除き、空白で区切り、falsyなもの（空文字列）を取り除いた配列をpartsに入れる cf. Array.prototype.filter()
            
            if (parts.length < 4) { // partsの要素は4以上とする e.g. 中１    個別二俣川太郎    英語 学    振替
                return { // 想定外の入力でも何かしら返す
                    '生徒情報': `${line}`,
                    '時限（時間）': timeslotInfo,
                    '教科': '',
                    '講師': 'その他',
                    'タグ': '',
                    'メモ': '',
                    '学年': '',
                };
            }
            
            const grade = parts[0];
            const studentName = parts[1];
            
            let subject = '';
            let lessonType = '';
            if (separateVideoEtc.checked) {
                lessonType = {'自': '自習', '学': '学トレ', '映': '映像授業', '英': '力シリーズ', '読': '力シリーズ', '閃': '力シリーズ', R: '力シリーズ'}[parts[3]] || 'その他';
            } else {
                lessonType = '映像・学トレなど';
            }
            subject = parts[2] || '';
            if ( ['力シリーズ', 'その他', '映像・学トレなど'].indexOf(lessonType) >= 0) {
                const subject2 = {'自': '自習', '学': '学トレ', '映': '映像授業', '英': '英語の力', '読': '読書の力', '閃': '閃きの力', R: 'Readingの力'}[parts[3]] || parts[3];
                if (subject == '指定なし') {
                    subject = subject2;
                } else {
                    subject = subject + ' ' + subject2;
                }
            }
            
            let j = 4;
            while (j < parts.length && knownIcons.indexOf(parts[j]) >= 0) j++; // partsのjより前はアイコン
            const icons = parts.slice(4, j).filter(Boolean);
            const memo  = parts.slice(j).filter(Boolean);
            
            return {
                '生徒情報': `${studentName}（${grade}）`,
                '時限（時間）': timeslotInfo,
                '教科': subject,
                '講師': lessonType,
                'タグ': icons.join(' '),
                'メモ': memo.join(' '),
                '学年': grade,
            };
        };
        
        const parseIndividualStudent = (line1, line2, line3) => {
            const timeslotInfo = `${currentTimeslot}（${currentTime}）`;
            
            const line1Parts = line1.trim().split(/\s+/).filter(p => p); // 学年と生徒氏名
            const line2Parts = line2.trim().split(/\s+/).filter(p => p); // 科目と「個」（とアイコン）
            const line3Parts = line3.trim().split(/\s+/).filter(p => p); // アイコンと講師とメモ
            
            if (line1Parts.length != 2) { // line1には学年と生徒氏名が必要
                return { // 想定外の入力でも何かしら返す
                    '生徒情報': `${line1} ${line2} ${line3}`,
                    '時限（時間）': timeslotInfo,
                    '教科': '',
                    '講師': '個別 その他',
                    'タグ': '',
                    'メモ': '',
                    '学年': '',
                };
            }
            
            const grade = line1Parts[0];
            const studentName = line1Parts[1];
            
            const subject = line2Parts[0] || '';
            const iconsFromLine2 = line2Parts.slice(1).filter(p => p != '個'); // 「個」は無視する
            
            let j = 0;
            while (j < line3Parts.length && knownIcons.indexOf(line3Parts[j]) >= 0) j++; // line3Partsのjより前はアイコン
            const iconsFromLine3 = line3Parts.slice(0, j).filter(Boolean);
            const instructor = line3Parts[j] || '個別 その他';
            const memo  = line3Parts.slice(j+1).filter(Boolean);
            
            return {
                '生徒情報': `${studentName}（${grade}）`,
                '時限（時間）': timeslotInfo,
                '教科': subject,
                '講師': instructor,
                'タグ': [...iconsFromLine2, ...iconsFromLine3].join(' '),
                'メモ': memo.join(' '),
                '学年': grade,
            };
        };
        
        for (let i = 0; i < lines.length; i++) {
            const trimmedLine= lines[i].trim();
            if (!trimmedLine) continue;
            
            if (isSectionVideo(trimmedLine)) { mode = 'video'; currentTimeslot=''; currentTime=''; continue; }
            if (isSectionIndividual(trimmedLine)) { mode = 'individual'; currentTimeslot=''; currentTime=''; continue; }
            if (isAdditional(trimmedLine)) { mode = 'additional'; currentTimeslot=''; currentTime=''; continue; }
            if (isHeader(trimmedLine)) continue;
            
            if (isTimeslotLetter(trimmedLine)) { currentTimeslot = trimmedLine; continue; }
            if (isTimeRange(trimmedLine)) { currentTime = trimmedLine; continue; }
            
            if (mode == 'video') { // 映像・学トレなど
                if (isStudentLine(trimmedLine)) { // 生徒: parseVideoStudent()でオブジェクトに整形し、schedule[]にいれる
                    const rec = parseVideoStudent(trimmedLine);
                    if (rec) schedule.push(rec);
                } else if ( !(trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) ) { // 力シリーズ担当講師
                    const key = `${currentTimeslot}（${currentTime}）`;
                    if (!videoInstructorByTimeslot.has(key)) videoInstructorByTimeslot.set(key, trimmedLine);
                }
            } else if (mode == 'individual') { // 個別授業
                if (!isStudentLine(trimmedLine)) { // 学年から始まる必要がある
                    continue; // ToDo: 想定外の入力でも何か返す
                }
                
                let line1 = trimmedLine;
                let line2 = '';
                let line3 = '';
                
                // linesにまだ行があり、特殊な行でなければline2, line3に追加する
                if (i + 1 < lines.length) {
                    line2 = lines[i + 1].trim();
                    if ( isTimeslotLetter(line2) || isTimeRange(line2) || isHeader(line2) || isSectionVideo(line2) || isSectionIndividual(line2) || isStudentLine(line2) ) {
                        line2 = '';
                    } else if (i + 2 < lines.length) {
                        line3 = lines[i + 2].trim();
                        if ( isTimeslotLetter(line3) || isTimeRange(line3) || isHeader(line3) || isSectionVideo(line3) || isSectionIndividual(line3) || isStudentLine(line3) ) {
                            line3 = '';
                        } 
                    }
                }
                
                const rec = parseIndividualStudent(line1, line2, line3);
                if (rec) schedule.push(rec);
                
                if (line3 != '') { // 先読みした分だけiを増やしておく
                    i += 2;
                } else if (line2 != '') {
                    i += 1;
                }
            } else if (mode == 'additional') { // 追記
                const timeslotMap = {A: 'A（13:30 〜 14:30）', B: 'B（14:40 〜 15:40）', C: 'C（15:50 〜 16:50）', D: 'D（17:00 〜 18:00）', E: 'E（18:10 〜 19:10）', F: 'F（19:20 〜 20:20）', G: 'G（20:30 〜 21:30）'};
                const parts = trimmedLine.trim().split(/\s+/).filter(Boolean);
                let currentTimeslot = '', instructor = '', content = '';
                if (isTimeslotLetter(parts[0])) {
                    currentTimeslot = parts[0];
                    instructor = parts[1];
                    content = parts.slice(2).join(' ');
                } else if (isTimeslotLetter(parts[1])) {
                    currentTimeslot = parts[1];
                    instructor = parts[0];
                    content = parts.slice(2).join(' ');
                }
                
                if (instructor != '') {
                    additionalSchedule.push({
                        '生徒情報': content,
                        '時限（時間）': timeslotMap[currentTimeslot],
                        '教科': content,
                        '講師': instructor,
                        'タグ': '',
                        'メモ': '',
                        '学年': '',
                    });
                }
                
            } // if
        } // for
        
        return [schedule, additionalSchedule];
    };
    
    /**********************************
     文字列（教科）を種にカラーコードを生成する
    ***********************************/
    const stringToColor = (str) => {
        const colorMap = {'英語': 'var(--border-color-english)',
                          '数学': 'var(--border-color-math)',
                          '算数': 'var(--border-color-math)',
                          '国語': 'var(--border-color-japanese)',
                          '理科': 'var(--border-color-science)',
                          '社会': 'var(--border-color-social)',
                          '閃き': 'var(--border-color-math)',
                          '読書': 'var(--border-color-japanese)',
                         };
        let color = 'var(--border-color-other)';
        for (let subject in colorMap) {
            if (str.includes(subject)) {
                color = colorMap[subject];
                break;
            }
        }
        
        /*let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); // cf. ビット演算
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }*/
        
        return color;
    };
    
    /**********************************
     学年の文字列を小1からの通し番号に変換する
    ***********************************/
    const gradeToValue = (grade) => {
        if (typeof grade !== 'string' || grade.length < 2) return 0;
        if (grade == '高卒') return 13;
        const normalizedGrade = grade.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // 全角数字を半角に
        const type = normalizedGrade.charAt(0); // 小中高
        const level = parseInt(normalizedGrade.slice(1), 10); // 学年の数字
        if (isNaN(level)) return 0;
        switch (type) {
            case '高': return 9 + level;
            case '中': return 6 + level;
            case '小': return 0 + level;
            default: return 0;
        }
    };
    
    /**********************************
     テーブルのセルを生成する
    ***********************************/
    const generateCellContent = (cellData, rowAttr, colAttr) => {
        let contentHtml = '<div class="table-cell-content">';
        cellData.forEach(item => {
            if (!item) return;

            let extraClass = '';
            let dataAttrs = '';
            let color = '';
            let parts = [];
            if (item && item.__placeholder) { //連コマを横並びにするときのすきまを埋める空のカード
                extraClass = 'placeholder';
                color = 'transparent';
                parts = [
                    { key: '生徒情報', value: '&nbsp;', defaultClass: '' },
                    { key: '教科', value: '&nbsp;', defaultClass: 'text-subject' },
                    { key: '講師', value: '&nbsp;', defaultClass: 'text-class' },
                    { key: '時限（時間）', value: '&nbsp;', defaultClass: 'text-period' },
                    { key: 'タグ', value: '&nbsp;', defaultClass: 'text-icon' },
                    { key: 'メモ', value: '&nbsp;', defaultClass: 'text-memo text-memo-table' },
                ];
            } else {
                dataAttrs = `data-student="${escapeHTML(item['生徒情報'])}" data-timeslot="${escapeHTML(item['時限（時間）'])}"`;
                color = stringToColor(item['教科']);
                parts = [
                    { key: '生徒情報', value: escapeHTML(item['生徒情報']) || '&nbsp;', defaultClass: '' },
                    { key: '教科', value: escapeHTML(item['教科']) || '&nbsp;', defaultClass: 'text-subject' },
                    { key: '講師', value: `授業: ${escapeHTML(item['講師'])}`, defaultClass: 'text-class' },
                    { key: '時限（時間）', value: escapeHTML(item['時限（時間）']) || '&nbsp;', defaultClass: 'text-period' },
                    { key: 'タグ', value: escapeHTML(item['タグ']) || '&nbsp;', defaultClass: 'text-icon' },
                    { key: 'メモ', value: escapeHTML(item['メモ']) || '&nbsp;', defaultClass: 'text-memo text-memo-table' },
                ];
            }
            
            let visibleParts = parts.filter(p => p.value && p.key !== rowAttr && p.key !== colAttr);
            if (!showTagsCheckbox.checked) { // タグを表示/非表示で高さを変える //ToDo: メモの表示
                visibleParts = visibleParts.filter(p => p.key !== 'タグ' && p.key !== 'メモ');
            }
            let infoHtml = visibleParts.map((p, i) => {
                const cls = i === 0 ? 'text-first' : p.defaultClass;
                return `<p class="${cls}">${p.value}</p>`;
            }).join('');
            
            contentHtml += `<div class="table-card ${extraClass}" ${dataAttrs} style="border-color: ${color}; cursor: pointer;">${infoHtml}</div>`;
        });
        return contentHtml + '</div>';
    };
    
    /**********************************
     カードビューのセルを生成する
    ***********************************/
    const generateCardContent = (items, rowAttr, colAttr) => {
        let contentHtml = '';
        items.forEach(item => {
            if (!item) return;
            
            const color = stringToColor(item['教科']);
            const parts = [
                { key: '生徒情報', value: escapeHTML(item['生徒情報']), defaultClass: '' },
                { key: '教科', value: escapeHTML(item['教科']), defaultClass: 'text-subject' },
                { key: '講師', value: `講師: ${escapeHTML(item['講師'])}` , defaultClass: 'text-class' },
                { key: '時限（時間）', value: escapeHTML(item['時限（時間）']), defaultClass: 'text-period' },
                { key: 'タグ', value: escapeHTML(item['タグ']), defaultClass: 'text-icon' },
                { key: 'メモ', value: escapeHTML(item['メモ']), defaultClass: 'text-memo' }
            ];
            let visibleParts = parts.filter(p => p.value && p.key !== rowAttr && p.key !== colAttr);
            if (!showTagsCheckbox.checked) {
                visibleParts = visibleParts.filter(p => p.key !== 'タグ');
            }
            const infoHtml = visibleParts.map((p, i) => {
                const cls = i === 0 ? 'text-first' : p.defaultClass;
                return `<p class="${cls}">${p.value}</p>`;
            }).join('');
            contentHtml += `<div class="cardview-card" style="border-color: ${color};">${infoHtml}</div>`;
        });
        return contentHtml;
    };
    
    /**********************************
     scheduleData[]と見出しの属性を受け取る。scheduleData[]から属性を取り出し、並び替える
    ***********************************/
    const getHeaders = (data, attr) => {
        if (attr === '生徒情報') {
            const uniqueStudents = Array.from(new Map(data.map(item => [item['生徒情報'], item])).values()); // 生徒情報のかぶりを消す
            uniqueStudents.sort((a, b) => { // まず学年で並べ替え、次に名前で並べ替える
                const gradeComparison = gradeToValue(b['学年']) - gradeToValue(a['学年']);
                if (gradeComparison !== 0) return gradeComparison;
                return a['生徒情報'].localeCompare(b['生徒情報'], 'ja');
            });
            return uniqueStudents.map(item => item['生徒情報']);
        } else if (attr === '講師') {
            const videoEtcLessonTypes = ['自習', '学トレ', '映像授業', '力シリーズ', 'その他', '映像・学トレなど'];
            return [...new Set(data.map(item => item[attr]))].sort((a, b) => { // 映像・学トレなどは後ろに並べる
                if ( videoEtcLessonTypes.indexOf(a) < 0 && videoEtcLessonTypes.indexOf(b) < 0 ) {
                    return a.localeCompare(b, 'ja');
                } else {
                    return videoEtcLessonTypes.indexOf(a) - videoEtcLessonTypes.indexOf(b);
                }
                
            });
        }
        return [...new Set(data.map(item => item[attr]))].sort();
    };
    
    /**********************************
     連コマの生徒を横並びにする関数
    ***********************************/
    const orderBySlots = (cellData, prevSlots) => {
        const byStudent = new Map(cellData.map(it => [it['生徒情報'], it]));
        let used = new Set();
        let slots = new Array(prevSlots.length).fill(null);
        
        // prevSlots[]にいる生徒がbyStudent{}（cellData[]）にもいたら、おなじindexでslots[]にいれる
        for (let idx = 0; idx < prevSlots.length; idx++) {
            const s = prevSlots[idx];
            if (s && byStudent.has(s)) {
                slots[idx] = byStudent.get(s);
                used.add(s); // slots[]に入れたらused[]に記録する
             }
        }
        
        // まだslots[]にいれてないものを空いているindexでいれる
        for (const [s, it] of byStudent.entries()) {
            if (used.has(s)) continue;
            
            for (let idx = 0; idx < prevSlots.length; idx++) {
                if (!slots[idx]) {
                    slots[idx] = it;
                    used.add(s);
                    break;
                }
            }
            
            if (used.has(s)) continue;
            slots.push(it);
            used.add(s);
        }
        
        const nextPrev = slots.map(it => it ? it['生徒情報'] : null) ; // slots[]の生徒をnextPrev[]に移す cf. 条件三項演算子
        return { slots, nextPrev };
    };
    
    /**********************************
     scheduleData[]と、入力している属性から、テーブルを生成する
    ***********************************/
    const renderTableView = () => {
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
        if (!rowAttr || !colAttr || rowAttr === colAttr) {
            tableContainer.innerHTML = `<div class="p-8 text-center text-gray-500">行と列に異なる属性を選択してください。</div>`; return;
        }
        
        let schedule = scheduleData;
        
        if (rowAttr === '講師' || colAttr === '講師') { // 行と列のどちらかが講師なら追記を表示する
            schedule = schedule.concat(additionalScheduleData);
        }
        
        let rowHeaders = schedule.length ? getHeaders(schedule, rowAttr) : [];
        const colHeaders = schedule.length ? getHeaders(schedule, colAttr) : [];
        if (rowHeaders.length === 0 || colHeaders.length === 0) {
            tableContainer.innerHTML = `<div class="p-8 text-center text-gray-400">データがありません。元データを入力してください。</div>`;
            return;
        }
        const dataMap = new Map();
        schedule.forEach(item => { // schedule[]からdataMap{}へ、表の形式で移す
            const rowKey = item[rowAttr], colKey = item[colAttr];
            if (!dataMap.has(rowKey)) dataMap.set(rowKey, new Map());
            if (!dataMap.get(rowKey).has(colKey)) dataMap.get(rowKey).set(colKey, []);
            dataMap.get(rowKey).get(colKey).push(item);
        });
        
        let tableHtml = '<div class="table-div"><table class="table-table">';
        tableHtml += `<thead class="table-head sticky"><tr><th scope="col" class="table-top-side">${escapeHTML(rowAttr)} ＼ ${escapeHTML(colAttr)}</th>`;
        colHeaders.forEach(h => { // 上の見出し
            const eh = escapeHTML(h);
            tableHtml += `<th scope="col" class="table-top" data-timeslot-col="${eh}">${eh}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;
        
        if (colAttr === '時限（時間）') { // 面談等のメモ
            tableHtml += `<tr class="table-row"><th scope="row" class="table-side h-[7em]"></th>`;
            colHeaders.forEach(colH => {
                const name = videoInstructorByTimeslot.get(colH) || '—';
                tableHtml += `<td class="table-cell" data-timeslot-col="${escapeHTML(colH)}"></td>`;
            });
        }
        
        rowHeaders.forEach(rowH => {
            // 右の見出し
            const erow = escapeHTML(rowH);
            tableHtml += `<tr class="table-row"><th scope="row" class="table-side" data-row-key="${erow}">${erow}</th>`;
            
            // セル
            let prevSlots = [];
            colHeaders.forEach(colH => {
                const cellData = dataMap.get(rowH)?.get(colH);
                let toRender = cellData;
                if ( toRender && rowAttr === '講師' && colAttr === '時限（時間）') {
                    const { slots, nextPrev } = orderBySlots(toRender, prevSlots);
                    toRender = slots.map(s => s ?? { __placeholder: true });
                    prevSlots = nextPrev;
                } // 連コマの生徒は横並びになるようにする
                tableHtml += `<td class="table-cell" data-timeslot-col="${escapeHTML(colH)}" data-row-key="${erow}">`;
                if (toRender) tableHtml += generateCellContent(toRender, rowAttr, colAttr);
                tableHtml += `</td>`;
            });
            
            tableHtml += `</tr>`;
        });
        
        if (colAttr === '時限（時間）') { // 力シリーズ担当講師
            tableHtml += `<tr class="table-row-power"><th scope="row" class="table-side-power" data-row-key="力シリーズ担当講師">力シリーズ担当講師</th>`;
            colHeaders.forEach(colH => {
                const name = videoInstructorByTimeslot.get(colH) || '—';
                tableHtml += `<td class="table-cell-power" data-timeslot-col="${escapeHTML(colH)}" data-row-key="力シリーズ担当講師">${escapeHTML(name)}</td>`;
            });
        }
        
        tableHtml += `</tbody><tfoot class="table-head"><tr><th scope="col" class="table-top-side">${escapeHTML(rowAttr)} ／ ${escapeHTML(colAttr)}</th>`;
        colHeaders.forEach(h => { // 下の見出し
            const eh = escapeHTML(h);
            tableHtml += `<th scope="col" class="table-top" data-timeslot-col=\"${eh}\">${eh}</th>`;
        });
        tableHtml += `</tr></tfoot></table></div>`;
        
        tableContainer.innerHTML = tableHtml;
        applyHighlight();
        // Re-apply zoom after rerender
        applyZoom(currentZoom);
    };
    
    /**********************************
     テーブルに適用しているハイライトを消す
    ***********************************/
    const clearHighlight = () => {
        tableContainer.querySelectorAll('[data-timeslot-col].col-highlight').forEach(el => {
            el.classList.remove('col-highlight');
        });
        tableContainer.querySelectorAll('[data-row-key].row-highlight').forEach(el => {
            el.classList.remove('row-highlight');
        });
        tableContainer.querySelectorAll('.table-card').forEach(card => {
            card.classList.remove('card-highlight');
            card.classList.remove('card-selected');
        });
    };
    
    /**********************************
     
    ***********************************/
    const applyHighlight = () => {
        clearHighlight();
        if (currentView !== 'table') return;
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
        if (!(rowAttr === '講師' && colAttr === '時限（時間）')) return;
        if (!selectedStudent || !selectedTimeslot) return;
        const safeStudentSel = CSS.escape ? `.table-card[data-student="${selectedStudent}"]` : `.table-card`;
        const cards = CSS.escape ? Array.from(tableContainer.querySelectorAll(safeStudentSel))
            .filter(c => c.getAttribute('data-student') === selectedStudent) :
            Array.from(tableContainer.querySelectorAll('.table-card')).filter(c => c.getAttribute('data-student') === selectedStudent);
        const timeslotsToHighlight = new Set(cards.map(c => c.getAttribute('data-timeslot')));
        timeslotsToHighlight.forEach(ts => {
            const sel = CSS.escape ? `[data-timeslot-col="${ts}"]` : '[data-timeslot-col]';
            const targets = CSS.escape ? tableContainer.querySelectorAll(sel) : tableContainer.querySelectorAll('[data-timeslot-col]');
            targets.forEach(el => {
                if (!CSS.escape && el.getAttribute('data-timeslot-col') !== ts) return;
                el.classList.add('col-highlight');
            });
        });
        const rowKeysToHighlight = new Set(cards.map(c => c.closest('td')?.getAttribute('data-row-key')).filter(Boolean));
        rowKeysToHighlight.forEach(rk => {
            const sel = CSS.escape ? `[data-row-key="${rk}"]` : '[data-row-key]';
            const targets = CSS.escape ? tableContainer.querySelectorAll(sel) : tableContainer.querySelectorAll('[data-row-key]');
            targets.forEach(el => {
                if (!CSS.escape && el.getAttribute('data-row-key') !== rk) return;
                el.classList.add('row-highlight');
            });
        });
        cards.forEach(card => {
            if (card.getAttribute('data-timeslot') === selectedTimeslot) {
                card.classList.add('card-selected');
            } else {
                card.classList.add('card-highlight');
            }
        });
    };
    
    /**********************************
     scheduleData[]と、入力している属性から、カードビューを生成する
    ***********************************/
    const renderCardView = () => {
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
         if (!rowAttr || !colAttr || rowAttr === colAttr) {
            cardContainer.innerHTML = `<div class="p-8 text-center text-gray-500 bg-white rounded-lg shadow">行と列に異なる属性を選択してください。</div>`; return;
        }
        
        let schedule = scheduleData;
        
        if (rowAttr === '講師' || colAttr === '講師') { // 行と列のどちらかが講師なら追記を表示する
            schedule = schedule.concat(additionalScheduleData);
        }
        
        let rowHeaders = getHeaders(schedule, rowAttr);
        
        let cardHtml = '';
        rowHeaders.forEach(rowH => {
            cardHtml += `<div class="cardview-div"><div class="cardview-first"><h3 class="cardview-first-index">${escapeHTML(rowH)}</h3></div>`;
            const itemsForRow = schedule.filter(item => item[rowAttr] === rowH);
            const colHeaders = getHeaders(itemsForRow, colAttr);
            const groupedByCol = itemsForRow.reduce((acc, item) => {
                const key = item[colAttr];
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {});
            cardHtml += '<div class="cardview-first-content">';
            colHeaders.forEach(colKey => {
                if (groupedByCol[colKey]) {
                    cardHtml += `<div class="cardview-second"><h4 class="cardview-second-index">${escapeHTML(colKey)}</h4><div class="cardview-second-content">`;
                    cardHtml += generateCardContent(groupedByCol[colKey], rowAttr, colAttr);
                    cardHtml += `</div></div>`;
                }
            });
            cardHtml += '</div></div>';
        });
        cardContainer.innerHTML = cardHtml;
    };
    
    const setView = (view) => {
        currentView = view;
        if (view === 'table') {
            cardContainer.style.display = 'none';
            tableContainer.style.display = 'block';
            tableViewBtn.classList.add('active');
            cardViewBtn.classList.remove('active');
            renderTableView();
            applyZoom(currentZoom);
        } else {
            tableContainer.style.display = 'none';
            cardContainer.style.display = 'block';
            cardViewBtn.classList.add('active');
            tableViewBtn.classList.remove('active');
            renderCardView();
        }
    };
    
    const handleSaveAsImage = () => {
        const target = document.getElementById('table-container');
        const prevDisplay = target.style.display;
        const wasHidden = getComputedStyle(target).display === 'none';
    renderTableView();
        let targetTable = target.querySelector('table');
        if (!targetTable) {
            alert('テーブルがありません。元データをご確認ください。');
            return;
        }
    // Temporarily disable highlights for export
    const prevSelectedStudent = selectedStudent;
    const prevSelectedTimeslot = selectedTimeslot;
    selectedStudent = null;
    selectedTimeslot = null;
    applyHighlight();
        // Temporarily reset zoom to 100% for export
        const prevZoom = target.style.zoom;
        target.style.zoom = '1';
        if (wasHidden) {
            target.style.visibility = 'hidden';
            target.style.display = 'block';
            target.style.position = 'absolute';
            target.style.left = '-10000px';
            target.style.top = '0';
            targetTable = target.querySelector('table');
        }
        saveImageButton.disabled = true;
        saveImageButton.textContent = '生成中...';
        html2canvas(targetTable, {
            scale: 2,
            useCORS: true,
            width: targetTable.scrollWidth,
            height: targetTable.scrollHeight,
            windowWidth: targetTable.scrollWidth,
            windowHeight: targetTable.scrollHeight
        }).then(canvas => {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const datePrefix = `${year}_${month}_${day}`;
            const link = document.createElement('a');
            link.download = `${datePrefix}_smart_jikanwari.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('画像生成に失敗しました:', err);
            alert('画像生成に失敗しました。');
        }).finally(() => {
            if (wasHidden) {
                target.style.visibility = '';
                target.style.position = '';
                target.style.left = '';
                target.style.top = '';
                target.style.display = prevDisplay || 'none';
                setView(currentView);
            }
            // Restore zoom
            target.style.zoom = prevZoom;
            // Restore highlights
            selectedStudent = prevSelectedStudent;
            selectedTimeslot = prevSelectedTimeslot;
            applyHighlight();
            saveImageButton.disabled = false;
            saveImageButton.innerHTML = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" viewBox=\"0 0 16 16\"><path d=\"M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z\"/><path d=\"M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z\"/></svg> 画像として保存`;
        });
    };
    
    const applyZoom = (scale) => {
        if (typeof scale !== 'number' || !isFinite(scale)) return;
        currentZoom = Math.min(Math.max(scale, ZOOM_MIN), ZOOM_MAX);
        tableContainer.style.zoom = String(currentZoom);
        if (zoomSelect) {
            const pct = Math.round(currentZoom * 100);
            zoomSelect.value = String(pct);
        }
    };
    
    const zoomStep = (dir) => {
        // Step by 10% per click
        const currentPct = Number(zoomSelect?.value) || Math.round(currentZoom * 100);
        const nextPct = Math.min(150, Math.max(30, currentPct + (dir > 0 ? 10 : -10)));
        applyZoom(nextPct / 100);
        renderTableView();
    };
    
    const buildShareUrl = () => {
        const text = rawDataEl.value || '';
        // Compress then Base64 encode
        let b64;
        try {
            b64 = (typeof LZString !== 'undefined' && LZString.compressToBase64)
                ? LZString.compressToBase64(text)
                : btoa(encodeURIComponent(text));
        } catch (_) {
            // Fallback to legacy encoding if compression fails
            b64 = btoa(encodeURIComponent(text));
        }
        const data64 = encodeURIComponent(b64);
        const u = new URL(window.location.href);
        u.search = '';
        u.hash = '';
        u.searchParams.set('data64', data64);
        return u.toString();
    };
    
    const handleShare = async () => {
        const url = buildShareUrl();
        shareButton.disabled = true;
        const original = shareButton.textContent;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const temp = document.createElement('textarea');
                temp.value = url;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
            }
            shareButton.textContent = 'コピーしました';
        } catch (e) {
            console.warn('クリップボードへのコピーに失敗:', e);
            shareButton.textContent = 'URLを表示';
            alert(url);
        } finally {
            setTimeout(() => {
                shareButton.textContent = original;
                shareButton.disabled = false;
            }, 1400);
        }
    };
    
    const initialize = () => {
        const loadFromQuery = () => {
            try {
                const params = new URLSearchParams(window.location.search);
                if (params.has('data')) {
                    const txt = params.get('data') || '';
                    if (txt.length <= 100000) {
                        rawDataEl.value = txt;
                    } else {
                        console.warn('データが大きすぎます（上限100KB）。読込をスキップしました。');
                    }
                } else if (params.has('data64')) {
                    const b64 = decodeURIComponent(params.get('data64'));
                    let decoded = '';
                    let loaded = false;
                    // Try compressed Base64 first
                    try {
                        if (typeof LZString !== 'undefined' && LZString.decompressFromBase64) {
                            const decomp = LZString.decompressFromBase64(b64);
                            if (typeof decomp === 'string') {
                                decoded = decomp;
                                loaded = true;
                            }
                        }
                    } catch (e) {
                        // Ignore and try legacy path
                    }
                    // Legacy fallback: base64 of encodeURIComponent(text)
                    if (!loaded) {
                        try {
                            const uriEncoded = atob(b64);
                            decoded = decodeURIComponent(uriEncoded);
                            loaded = true;
                        } catch (e) {
                            console.warn('旧形式データのデコードにも失敗:', e);
                        }
                    }
                    if (loaded) {
                        if (decoded.length <= 100000) {
                            rawDataEl.value = decoded;
                        } else {
                            console.warn('データが大きすぎます（上限100KB）。読込をスキップしました。');
                        }
                    }
                }
            } catch (e) {
                console.warn('クエリからのデータ読込に失敗:', e);
            }
        };
        
        loadFromQuery();
        [scheduleData, additionalScheduleData] = parseRawData(rawDataEl.value);
        // Build selector options from data or defaults
        const attributes = scheduleData.length > 0
            ? Object.keys(scheduleData[0]).filter(key => key !== '学年')
            : DEFAULT_ATTRIBUTES.slice();
        rowSelector.innerHTML = ''; colSelector.innerHTML = '';
        attributes.forEach(attr => {
            rowSelector.innerHTML += `<option value=\"${attr}\">${attr}</option>`;
            colSelector.innerHTML += `<option value=\"${attr}\">${attr}</option>`;
        });
        // Set sensible defaults
        if (attributes.includes('講師') && attributes.includes('時限（時間）')) {
            rowSelector.value = '講師';
            colSelector.value = '時限（時間）';
        } else if (attributes.length >= 2) {
            rowSelector.value = attributes[0];
            colSelector.value = attributes[1];
        }
        rawDataEl.addEventListener('input', () => {
           [scheduleData, additionalScheduleData] = parseRawData(rawDataEl.value);
           setView(currentView);
        });
        rowSelector.addEventListener('change', () => {
            selectedStudent = null; selectedTimeslot = null;
            setView(currentView);
        });
        colSelector.addEventListener('change', () => {
            selectedStudent = null; selectedTimeslot = null;
            setView(currentView);
        });
        tableViewBtn.addEventListener('click', () => setView('table'));
        cardViewBtn.addEventListener('click', () => setView('card'));
        saveImageButton.addEventListener('click', handleSaveAsImage);
        shareButton.addEventListener('click', handleShare);
        showTagsCheckbox.addEventListener('change', () => setView(currentView));
        if (separateVideoEtc) {
            separateVideoEtc.addEventListener('change', () => {
                [scheduleData, additionalScheduleData] = parseRawData(rawDataEl.value);
                setView(currentView);
                // Fire custom event for external listeners
                try {
                    const ev = new CustomEvent('separateVideoEtc', { detail: { checked: !!separateVideoEtc.checked } });
                    document.dispatchEvent(ev);
                } catch (_) { /* ignore */ }
            });
        }
        // Collapsible panel toggle with simple height animation
        if (panelToggleBtn && panelBody) {
            const collapse = () => {
                panelToggleBtn.setAttribute('aria-expanded', 'false');
                panelToggleBtn.textContent = '展開する';
                const h = panelBody.scrollHeight;
                panelBody.style.overflow = 'hidden';
                panelBody.style.height = h + 'px';
                // force reflow
                void panelBody.offsetHeight;
                panelBody.style.transition = 'height 200ms ease';
                panelBody.style.height = '0px';
                const onEnd = () => {
                    panelBody.removeEventListener('transitionend', onEnd);
                    panelBody.style.display = 'none';
                    panelBody.style.transition = '';
                    panelBody.style.height = '';
                    panelBody.style.overflow = '';
                };
                panelBody.addEventListener('transitionend', onEnd);
            };
            const expand = () => {
                panelToggleBtn.setAttribute('aria-expanded', 'true');
                panelToggleBtn.textContent = '折りたたむ';
                panelBody.style.display = 'block';
                panelBody.style.overflow = 'hidden';
                panelBody.style.height = '0px';
                // force reflow
                void panelBody.offsetHeight;
                const target = panelBody.scrollHeight;
                panelBody.style.transition = 'height 220ms ease';
                panelBody.style.height = target + 'px';
                const onEnd = () => {
                    panelBody.removeEventListener('transitionend', onEnd);
                    panelBody.style.transition = '';
                    panelBody.style.height = '';
                    panelBody.style.overflow = '';
                };
                panelBody.addEventListener('transitionend', onEnd);
            };
            panelToggleBtn.addEventListener('click', () => {
                const expanded = panelToggleBtn.getAttribute('aria-expanded') === 'true';
                if (expanded) collapse(); else expand();
            });
        }
        // Clear data popover positioning and actions
        const isPopoverVisible = () => clearPopover && !clearPopover.classList.contains('hidden');
        const positionPopover = () => {
            if (!isPopoverVisible() || !clearDataButton || !clearPopover) return;
            const btnRect = clearDataButton.getBoundingClientRect();
            const popInner = clearPopover.firstElementChild;
            if (!popInner) return;
            const viewportPadding = 8;
            // Default position (fixed): below and left-aligned to the button
            let left = btnRect.left;
            let top = btnRect.bottom + 8;
            const popWidth = popInner.offsetWidth || 288; // fallback to w-72
            const popHeight = popInner.offsetHeight || 160;
            // Clamp horizontally within the UI container (fallback to viewport)
            const container = document.querySelector('.container');
            if (container) {
                const crect = container.getBoundingClientRect();
                const maxLeft = crect.right - popWidth - viewportPadding;
                const minLeft = crect.left + viewportPadding;
                left = Math.max(minLeft, Math.min(left, maxLeft));
            } else {
                const maxLeft = window.innerWidth - popWidth - viewportPadding;
                const minLeft = viewportPadding;
                left = Math.max(minLeft, Math.min(left, maxLeft));
            }
            const maxTop = window.innerHeight - popHeight - viewportPadding;
            const minTop = viewportPadding;
            top = Math.max(minTop, Math.min(top, maxTop));
            clearPopover.style.left = left + 'px';
            clearPopover.style.top = top + 'px';
        };
        const showClearPopover = () => {
            if (!clearPopover) return;
            clearPopover.classList.remove('hidden');
            positionPopover();
        };
        const hideClearPopover = () => {
            if (!clearPopover) return;
            clearPopover.classList.add('hidden');
        };
        if (clearDataButton && clearPopover) {
            clearDataButton.addEventListener('click', (e) => {
                e.preventDefault();
                showClearPopover();
            });
            if (clearCancelBtn) clearCancelBtn.addEventListener('click', hideClearPopover);
            if (clearConfirmBtn) clearConfirmBtn.addEventListener('click', () => {
                rawDataEl.value = '';
                [scheduleData, additionalScheduleData] = parseRawData(rawDataEl.value);
                selectedStudent = null; selectedTimeslot = null;
                setView(currentView);
                hideClearPopover();
                rawDataEl.focus();
            });
            // Dismiss on outside click
            document.addEventListener('mousedown', (ev) => {
                if (!isPopoverVisible()) return;
                if (clearPopover.contains(ev.target)) return;
                if (ev.target === clearDataButton || clearDataButton.contains(ev.target)) return;
                hideClearPopover();
            });
            // Reposition on scroll/resize
            window.addEventListener('scroll', () => { if (isPopoverVisible()) positionPopover(); }, true);
            window.addEventListener('resize', () => { if (isPopoverVisible()) positionPopover(); });
        }
        if (zoomSelect) {
            zoomSelect.addEventListener('change', () => {
                const raw = Number(zoomSelect.value);
                if (isNaN(raw)) return;
                const clamped = Math.min(150, Math.max(30, raw));
                applyZoom(clamped / 100);
                renderTableView();
            });
        }
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => { zoomStep(1); renderTableView(); });
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { zoomStep(-1); renderTableView(); });
        tableContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.table-card');
            if (!card) return;
            if (!(currentView === 'table' && rowSelector.value === '講師' && colSelector.value === '時限（時間）')) return;
            const student = card.getAttribute('data-student');
            const timeslot = card.getAttribute('data-timeslot');
            if (selectedStudent === student && selectedTimeslot === timeslot) {
                selectedStudent = null;
                selectedTimeslot = null;
            } else {
                selectedStudent = student;
                selectedTimeslot = timeslot;
            }
            applyHighlight();
        });
        if (window.innerWidth < 768) {
            setView('card');
        } else {
            setView('table');
            applyZoom(1);
        }
        // Emit initial separateVideoEtc state for listeners
        try {
            if (separateVideoEtc) {
                const ev = new CustomEvent('separateVideoEtc', { detail: { checked: !!separateVideoEtc.checked } });
                document.dispatchEvent(ev);
            }
        } catch (_) { /* ignore */ }
    };
    
    initialize();
});