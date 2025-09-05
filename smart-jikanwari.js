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
    const zoomSelect = document.getElementById('zoomSelect');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const noticeArea = document.getElementById('notice-area');
    const noticeText = document.getElementById('notice-text');
    const panelToggleBtn = document.getElementById('panelToggleBtn');
    const panelBody = document.getElementById('panel-body');
    const clearDataButton = document.getElementById('clearDataButton');
    const clearPopover = document.getElementById('clearPopover');
    const clearCancelBtn = document.getElementById('clearCancelBtn');
    const clearConfirmBtn = document.getElementById('clearConfirmBtn');

    let scheduleData = [];
    let currentView = 'table';
    let selectedStudent = null;
    let selectedTimeslot = null;
    let videoInstructorByTimeslot = new Map();
    let currentZoom = 1;
    const allowedZooms = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const ICON_TYPES = new Set(['出席','欠席','追加受講','振替','SNET振替','講習会','マンツーマン','有効時限']);
    const showAttendanceCheckbox = document.getElementById('showAttendanceCheckbox');

    // Known one-letter flags that may appear alongside tags
    const KNOWN_TAG_OR_FLAGS = new Set([...ICON_TYPES, '個', '映', '学', '閃']);

    const collectUnknownTags = (data) => {
        const unknown = new Set();
        if (!Array.isArray(data)) return [];
        data.forEach(item => {
            const raw = (item && item['タグ']) ? String(item['タグ']) : '';
            if (!raw) return;
            raw.split(/\s+/).filter(Boolean).forEach(tok => {
                if (!KNOWN_TAG_OR_FLAGS.has(tok)) unknown.add(tok);
            });
        });
        return Array.from(unknown);
    };

    const updateNotice = () => {
        if (!noticeArea || !noticeText) return;
        const list = collectUnknownTags(scheduleData);
        if (list.length > 0) {
            const shown = list.slice(0, 10);
            const more = list.length - shown.length;
            const msg = more > 0
                ? `未定義のタグがあります: ${shown.join('、')} …（ほか ${more} 件）`
                : `未定義のタグがあります: ${shown.join('、')}`;
            noticeText.textContent = msg;
            noticeArea.classList.remove('hidden');
        } else {
            noticeText.textContent = '';
            noticeArea.classList.add('hidden');
        }
    };

    const positionClearPopover = () => {
        if (!clearPopover || !clearDataButton || clearPopover.classList.contains('hidden')) return;
        const rect = clearDataButton.getBoundingClientRect();
        // Make visible but hidden to measure
        const prevVis = clearPopover.style.visibility;
        clearPopover.style.visibility = 'hidden';
        // Ensure it's rendered for measurement
        const prevHidden = clearPopover.classList.contains('hidden');
        if (prevHidden) clearPopover.classList.remove('hidden');
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const margin = 8;
        // Constrain max width to viewport width minus margins
        const maxW = Math.max(160, vpW - margin * 2);
        clearPopover.style.maxWidth = `${maxW}px`;
        // Measure after applying max-width
        const popW = clearPopover.offsetWidth;
        const popH = clearPopover.offsetHeight;
        let left = rect.left; // fixed position uses viewport coords
        let top = rect.bottom + margin;
        // Horizontal clamp with margin
        if (left + popW > vpW - margin) {
            // Try aligning right edge of popover to right edge of button first
            left = Math.max(margin, Math.min(vpW - popW - margin, rect.right - popW));
        }
        left = Math.max(margin, left);
        // Prefer below; if overflow bottom, try above, else clamp
        if (top + popH > vpH - margin) {
            const above = rect.top - popH - margin;
            top = above >= margin ? above : Math.max(margin, vpH - popH - margin);
        }
        clearPopover.style.left = `${left}px`;
        clearPopover.style.top = `${top}px`;
        // Restore visibility
        clearPopover.style.visibility = prevVis || '';
    };
    const showClearPopover = () => {
        if (!clearPopover || !clearDataButton) return;
        clearPopover.classList.remove('hidden');
        positionClearPopover();
    };
    const hideClearPopover = () => {
        if (!clearPopover) return;
        clearPopover.classList.add('hidden');
    };

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

    const parseRawData = (text) => {
        // Remove blank/whitespace-only lines before interpretation (handles CRLF too)
        const lines = text
            .split('\n')
            .map(l => l.replace(/\r/g, ''))
            .filter(l => l.trim().length > 0);
        const schedule = [];
        let currentTimeslot = '', currentTime = '';
        let mode = 'unknown';
        videoInstructorByTimeslot = new Map();

        const isTimeslotLetter = (s) => /^[A-Z]$/.test(s);
        const isTimeRange = (s) => /\d{1,2}:\d{2}\s*〜\s*\d{1,2}:\d{2}/.test(s);
        const isHeader = (s) => s.startsWith('時限');
        const isSectionVideo = (s) => s.startsWith('映像・学トレなど');
        const isSectionIndividual = (s) => s.startsWith('個別授業');
        const isGradeLine = (s) => /^(小|中|高)/.test(s);
        const parseVideoStudent = (line) => {
            // New rule: [学年][生徒氏名][科目名1][科目名2][タグ?][メモ...]
            const parts = line.trim().split(/\s+/).filter(Boolean);
            if (parts.length < 2) return null; // Need at least grade and student name
            const grade = parts[0];
            const studentName = parts[1];
            const subject1 = parts[2] || '';
            const subject2 = parts[3] || '';
            // Display order swapped: subject2 first, then subject1
            const subject = (subject2 + ' ' + subject1).trim();
            // Split remaining tokens: leading ICON_TYPES are tags, the rest join as memo
            const rest = parts.slice(4);
            const tagTokens = [];
            let memoTokens = [];
            for (let i = 0; i < rest.length; i++) {
                const tk = rest[i];
                if (ICON_TYPES.has(tk) && memoTokens.length === 0) {
                    tagTokens.push(tk);
                } else {
                    memoTokens = rest.slice(i);
                    break;
                }
            }
            const tags = tagTokens;
            const memo = memoTokens.join(' ');
            const timeslotInfo = `${currentTimeslot}（${currentTime}）`;
            return {
                '生徒情報': `${studentName} (${grade})`,
                '時限（時間）': timeslotInfo,
                '教科': subject,
                '講師': '映像・学トレなど',
                'タグ': tags.join(' '),
                'メモ': memo,
                '学年': grade,
            };
        };

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmedLine = raw.trim();
            if (!trimmedLine) continue;
            if (isSectionVideo(trimmedLine)) { mode = 'video'; currentTimeslot=''; currentTime=''; continue; }
            if (isSectionIndividual(trimmedLine)) { mode = 'individual'; currentTimeslot=''; currentTime=''; continue; }
            if (isHeader(trimmedLine)) continue;

            if (isTimeslotLetter(trimmedLine)) { currentTimeslot = trimmedLine; continue; }
            if (isTimeRange(trimmedLine)) { currentTime = trimmedLine; continue; }

            if (mode === 'video') {
                if (!isGradeLine(trimmedLine) && !isTimeslotLetter(trimmedLine) && !isTimeRange(trimmedLine)) {
                    if (currentTimeslot && currentTime) {
                        if (!(trimmedLine.startsWith('{') && trimmedLine.endsWith('}'))) {
                            const key = `${currentTimeslot}（${currentTime}）`;
                            if (!videoInstructorByTimeslot.has(key)) videoInstructorByTimeslot.set(key, trimmedLine);
                        }
                    }
                    continue;
                }
                if (isGradeLine(trimmedLine)) {
                    const rec = parseVideoStudent(trimmedLine);
                    if (rec) schedule.push(rec);
                }
                continue;
            }

            if (mode === 'individual') {
                if (i + 2 < lines.length) {
                    const line1Parts = lines[i].trim().split(/\s+/).filter(p => p);
                    const line2Parts = lines[i + 1].trim().split(/\s+/).filter(p => p);
                    const line3Parts = lines[i + 2].trim().split(/\s+/).filter(p => p);
                    if (line1Parts.length >= 2 && line3Parts.length > 0) {
                        const grade = line1Parts[0];
                        const studentName = line1Parts.slice(1).join(' ');
                        const studentInfo = `${studentName} (${grade})`;
                        const subject = line2Parts[0] || '';
                        const tagsFromLine2 = line2Parts.slice(1);
                        let instructor = '';
                        let memo = '';
                        // New rule: line3 is [タグ...?][講師名][メモ...?]
                        let splitIdx = 0;
                        while (splitIdx < line3Parts.length && KNOWN_TAG_OR_FLAGS.has(line3Parts[splitIdx])) {
                            splitIdx++;
                        }
                        const tagsFromLine3 = line3Parts.slice(0, splitIdx);
                        instructor = line3Parts[splitIdx] || '';
                        memo = line3Parts.slice(splitIdx + 1).join(' ');
                        const allTags = [...tagsFromLine2, ...tagsFromLine3];
                        const timeslotInfo = `${currentTimeslot}（${currentTime}）`;
                        schedule.push({
                            '生徒情報': studentInfo,
                            '時限（時間）': timeslotInfo,
                            '教科': subject,
                            '講師': instructor,
                            'タグ': allTags.join(' '),
                            'メモ': memo,
                            '学年': grade,
                        });
                        i += 2;
                        continue;
                    }
                }
            }
        }
        return schedule;
    };

    const stringToColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    };

    const gradeToValue = (grade) => {
        if (typeof grade !== 'string' || grade.length < 2) return 0;
        const normalizedGrade = grade.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        const type = normalizedGrade.charAt(0);
        const level = parseInt(normalizedGrade.slice(1), 10);
        if (isNaN(level)) return 0;
        switch (type) {
            case '高': return 9 + level;
            case '中': return 6 + level;
            case '小': return 0 + level;
            default: return 0;
        }
    };

    const generateCellContent = (cellData, rowAttr, colAttr) => {
        let contentHtml = '<div class="flex flex-col gap-2">';
        cellData.forEach(item => {
            if (item && item.__placeholder) {
                const potentialParts = [
                    { key: '生徒情報', className: '' },
                    { key: '教科', className: 'text-gray-600' },
                    { key: '講師', className: 'text-gray-600' },
                    { key: '時限（時間）', className: 'text-sm text-gray-500' },
                    { key: 'タグ', className: 'text-xs text-gray-400' },
                ];
                let visibleParts = potentialParts.filter(p => p.key !== rowAttr && p.key !== colAttr);
                if (!showTagsCheckbox.checked) {
                    visibleParts = visibleParts.filter(p => p.key !== 'タグ');
                }
                let linesHtml = visibleParts.map((part, index) => {
                    const cls = index === 0 ? `font-bold text-gray-800 ${part.className}`.trim() : part.className;
                    return `<p class="${cls}">&nbsp;</p>`;
                }).join('');
                linesHtml += `<p class="text-xs text-red-500 font-semibold" style="min-height:2rem;max-height:2rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">&nbsp;</p>`;
                contentHtml += `<div class="bg-white p-2 rounded-md border-l-4 flex flex-col justify-start class-card placeholder" style="border-color: transparent;">${linesHtml}</div>`;
                return;
            }
            const color = stringToColor(item['教科']);
            const rawTags = (item['タグ'] || '');
            const tagList = rawTags ? rawTags.split(/\s+/).filter(Boolean) : [];
            const filteredTagList = tagList.filter(t => {
                if (!showTagsCheckbox.checked) return false;
                if (showAttendanceCheckbox && !showAttendanceCheckbox.checked && (t === '出席' || t === '欠席')) return false;
                return true;
            });
            const visibleTagValue = escapeHTML(filteredTagList.join(' '));
            const parts = [
                { key: '生徒情報', value: escapeHTML(item['生徒情報']), className: '' },
                { key: '教科', value: escapeHTML(item['教科']), className: 'text-gray-600' },
                { key: '講師', value: `講師: ${escapeHTML(item['講師'])}`, className: 'text-gray-600' },
                { key: '時限（時間）', value: escapeHTML(item['時限（時間）']), className: 'text-sm text-gray-500' },
                { key: 'タグ', value: visibleTagValue, className: 'text-xs text-gray-400' },
            ];
            const memoText = (item['メモ'] || '').trim();
            const renderMemo = (show) => {
                const content = show && memoText ? escapeHTML(memoText) : '\u00A0';
                return `<p class="text-xs text-red-500 font-semibold" style="min-height:2rem;max-height:2rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${content}</p>`;
            };
            let visibleParts = parts.filter(p => p.value && p.key !== rowAttr && p.key !== colAttr);
            if (!showTagsCheckbox.checked) {
                visibleParts = visibleParts.filter(p => p.key !== 'タグ');
            }
            let infoHtml = visibleParts.map((part, index) => {
                const first = index === 0 ? 'font-bold text-gray-800' : '';
                const cls = first ? `${first} ${part.className}`.trim() : part.className;
                return `<p class="${cls}">${part.value}</p>`;
            }).join('');
            const tagUsedAsAxis = (rowAttr === 'タグ' || colAttr === 'タグ');
            if (showTagsCheckbox.checked && !tagUsedAsAxis && !item['タグ']) {
                infoHtml += `<p class="text-xs text-gray-400">&nbsp;</p>`;
            }
            const memoHtml = renderMemo(true);
            const dataAttrs = `data-student="${escapeHTML(item['生徒情報'])}" data-timeslot="${escapeHTML(item['時限（時間）'])}` + `"`;
            contentHtml += `<div class="bg-white p-2 rounded-md border-l-4 flex flex-col justify-start class-card" ${dataAttrs} style="border-color: ${color}; cursor: pointer;">${infoHtml}${memoHtml}</div>`;
        });
        return contentHtml + '</div>';
    };

    const generateCardContent = (items, rowAttr, colAttr) => {
        let contentHtml = '';
        items.forEach(item => {
            const color = stringToColor(item['教科']);
            const rawTags2 = (item['タグ'] || '');
            const tagList2 = rawTags2 ? rawTags2.split(/\s+/).filter(Boolean) : [];
            const filteredTagList2 = tagList2.filter(t => {
                if (!showTagsCheckbox.checked) return false;
                if (showAttendanceCheckbox && !showAttendanceCheckbox.checked && (t === '出席' || t === '欠席')) return false;
                return true;
            });
            const visibleTagValue2 = escapeHTML(filteredTagList2.join(' '));
            const potentialParts = [
                { key: '生徒情報', value: escapeHTML(item['生徒情報']), defaultClass: '' },
                { key: '教科', value: escapeHTML(item['教科']), defaultClass: 'text-gray-600' },
                { key: '講師', value: `講師: ${escapeHTML(item['講師'])}` , defaultClass: 'text-gray-600' },
                { key: '時限（時間）', value: escapeHTML(item['時限（時間）']), defaultClass: 'text-sm text-gray-500' },
                { key: 'タグ', value: visibleTagValue2, defaultClass: 'text-xs text-gray-400' },
                { key: 'メモ', value: escapeHTML(item['メモ']), defaultClass: 'text-xs text-red-500 font-semibold' }
            ];
            let visibleParts = potentialParts.filter(p => p.value && p.key !== rowAttr && p.key !== colAttr);
            if (!showTagsCheckbox.checked) {
                visibleParts = visibleParts.filter(p => p.key !== 'タグ');
            }
            const infoHtml = visibleParts.map((part, index) => {
                const className = index === 0 ? 'font-bold text-gray-800' : part.defaultClass;
                return `<p class="${className}">${part.value}</p>`;
            }).join('');
            contentHtml += `<div class="bg-gray-50 p-3 rounded-md border-l-4" style="border-color: ${color};">${infoHtml}</div>`;
        });
        return contentHtml;
    };

    const getHeaders = (data, attr) => {
        if (attr === '生徒情報') {
            const uniqueStudents = Array.from(new Map(data.map(item => [item['生徒情報'], item])).values());
            uniqueStudents.sort((a, b) => {
                const gradeComparison = gradeToValue(b['学年']) - gradeToValue(a['学年']);
                if (gradeComparison !== 0) return gradeComparison;
                return a['生徒情報'].localeCompare(b['生徒情報'], 'ja');
            });
            return uniqueStudents.map(item => item['生徒情報']);
        }
        return [...new Set(data.map(item => item[attr]))].sort();
    };

    const renderTableView = () => {
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
        if (!rowAttr || !colAttr || rowAttr === colAttr) {
            tableContainer.innerHTML = `<div class="p-8 text-center text-gray-500">行と列に異なる属性を選択してください。</div>`; return;
        }
        let rowHeaders = getHeaders(scheduleData, rowAttr);
        const colHeaders = getHeaders(scheduleData, colAttr);
        const dataMap = new Map();
        scheduleData.forEach(item => {
            const rowKey = item[rowAttr], colKey = item[colAttr];
            if (!dataMap.has(rowKey)) dataMap.set(rowKey, new Map());
            if (!dataMap.get(rowKey).has(colKey)) dataMap.get(rowKey).set(colKey, []);
            dataMap.get(rowKey).get(colKey).push(item);
        });
        if (rowAttr === '講師' && colAttr === '時限（時間）') {
            const vlabel = '映像・学トレなど';
            if (rowHeaders.includes(vlabel)) {
                rowHeaders = rowHeaders.filter(h => h !== vlabel).concat([vlabel]);
            }
        }
        const orderBySlots = (cellData, prevSlots) => {
            const byStudent = new Map(cellData.map(it => [it['生徒情報'], it]));
            const used = new Set();
            const slots = [null, null];
            [0,1].forEach(i => {
                const s = prevSlots[i];
                if (s && byStudent.has(s)) {
                    slots[i] = byStudent.get(s);
                    used.add(s);
                }
            });
            for (const [s, it] of byStudent.entries()) {
                if (used.has(s)) continue;
                const idx = slots[0] === null ? 0 : (slots[1] === null ? 1 : -1);
                if (idx !== -1) {
                    slots[idx] = it;
                    used.add(s);
                }
            }
            const nextPrev = [slots[0] ? slots[0]['生徒情報'] : null, slots[1] ? slots[1]['生徒情報'] : null];
            return { slots, nextPrev };
        };
        let tableHtml = '<div class="overflow-x-auto"><table class="min-w-full text-sm text-left text-gray-500">';
        tableHtml += `<thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr><th scope="col" class="py-3 px-4 font-bold whitespace-nowrap bg-gray-100 sticky left-0 z-20" style="box-shadow: 2px 0 0 rgba(0,0,0,0.05);">${escapeHTML(rowAttr)} \\ ${escapeHTML(colAttr)}</th>`;
        colHeaders.forEach(h => {
            const eh = escapeHTML(h);
            tableHtml += `<th scope=\"col\" class=\"py-3 px-4 font-semibold whitespace-nowrap\" data-timeslot-col=\"${eh}\">${eh}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;
        rowHeaders.forEach(rowH => {
            const erow = escapeHTML(rowH);
            tableHtml += `<tr class=\"bg-white border-b hover:bg-gray-50\"><th scope=\"row\" class=\"py-3 px-4 font-bold text-gray-900 whitespace-nowrap bg-white border-r sticky left-0 z-10\" data-row-key=\"${erow}\" style=\"box-shadow: 2px 0 0 rgba(0,0,0,0.05);\">${erow}</th>`;
            let prevSlots = [null, null];
            colHeaders.forEach(colH => {
                const cellData = dataMap.get(rowH)?.get(colH);
                let toRender = cellData;
                if (cellData && rowAttr === '講師' && colAttr === '時限（時間）' && rowH !== '映像・学トレなど') {
                    const { slots, nextPrev } = orderBySlots(cellData, prevSlots);
                    toRender = slots.map(s => s ?? { __placeholder: true });
                    prevSlots = nextPrev;
                }
                tableHtml += `<td class=\"py-2 px-2 align-top min-w-[200px]\" data-timeslot-col=\"${escapeHTML(colH)}\" data-row-key=\"${erow}\">`;
                if (toRender) tableHtml += generateCellContent(toRender, rowAttr, colAttr);
                tableHtml += `</td>`;
            });
            tableHtml += `</tr>`;
        });
        if (rowAttr === '講師' && colAttr === '時限（時間）') {
            tableHtml += '</tbody><tfoot>';
            tableHtml += `<tr class=\"bg-gray-50 border-t\"><th scope=\"row\" class=\"py-2 px-4 font-bold text-gray-900 whitespace-nowrap bg-gray-50 border-r sticky left-0 z-10\" style=\"box-shadow: 2px 0 0 rgba(0,0,0,0.05);\">力シリーズ担当講師</th>`;
            colHeaders.forEach(colH => {
                const name = videoInstructorByTimeslot.get(colH) || '—';
                tableHtml += `<td class=\"py-2 px-2 text-sm text-gray-700\">${escapeHTML(name)}</td>`;
            });
            tableHtml += `</tr></tfoot></table></div>`;
        } else {
            tableHtml += '</tbody></table></div>';
        }
    tableContainer.innerHTML = tableHtml;
    applyHighlight();
    // Re-apply zoom after rerender
    applyZoom(currentZoom);
    };

    const clearHighlight = () => {
        tableContainer.querySelectorAll('[data-timeslot-col].col-highlight').forEach(el => {
            el.classList.remove('col-highlight');
        });
        tableContainer.querySelectorAll('[data-row-key].row-highlight').forEach(el => {
            el.classList.remove('row-highlight');
        });
        tableContainer.querySelectorAll('.class-card').forEach(card => {
            card.classList.remove('card-highlight');
            card.classList.remove('card-selected');
        });
    };

    const applyHighlight = () => {
        clearHighlight();
        if (currentView !== 'table') return;
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
        if (!(rowAttr === '講師' && colAttr === '時限（時間）')) return;
        if (!selectedStudent || !selectedTimeslot) return;
        const safeStudentSel = CSS.escape ? `.class-card[data-student="${selectedStudent}"]` : `.class-card`;
        const cards = CSS.escape ? Array.from(tableContainer.querySelectorAll(safeStudentSel))
            .filter(c => c.getAttribute('data-student') === selectedStudent) :
            Array.from(tableContainer.querySelectorAll('.class-card')).filter(c => c.getAttribute('data-student') === selectedStudent);
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

    const renderCardView = () => {
        const rowAttr = rowSelector.value, colAttr = colSelector.value;
         if (!rowAttr || !colAttr || rowAttr === colAttr) {
            cardContainer.innerHTML = `<div class=\"p-8 text-center text-gray-500 bg-white rounded-lg shadow\">行と列に異なる属性を選択してください。</div>`; return;
        }
        let rowHeaders = getHeaders(scheduleData, rowAttr);
        if (rowAttr === '講師') {
            const vlabel = '映像・学トレなど';
            if (rowHeaders.includes(vlabel)) {
                rowHeaders = rowHeaders.filter(h => h !== vlabel).concat([vlabel]);
            }
        }
        let cardHtml = '';
        rowHeaders.forEach(rowH => {
            cardHtml += `<div class=\"bg-white rounded-xl shadow-lg overflow-hidden\"><div class=\"p-4 bg-gray-100 border-b\"><h3 class=\"font-bold text-lg text-gray-800\">${escapeHTML(rowH)}</h3></div>`;
            const itemsForRow = scheduleData.filter(item => item[rowAttr] === rowH);
            const colHeaders = getHeaders(itemsForRow, colAttr);
            const groupedByCol = itemsForRow.reduce((acc, item) => {
                const key = item[colAttr];
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {});
            cardHtml += '<div class=\"p-4 space-y-4\">';
            colHeaders.forEach(colKey => {
                if (groupedByCol[colKey]) {
                    cardHtml += `<div><h4 class=\"font-semibold text-md text-gray-700 mb-2 pb-1 border-b\">${escapeHTML(colKey)}</h4><div class=\"space-y-2\">`;
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
        currentZoom = Math.min(Math.max(scale, allowedZooms[0]), allowedZooms[allowedZooms.length - 1]);
        // Use CSS zoom to scale layout without extra scroll space
        tableContainer.style.zoom = String(currentZoom);
        if (zoomSelect) {
            // Snap select to closest allowed value
            let closest = allowedZooms[0];
            let diff = Math.abs(currentZoom - closest);
            for (const z of allowedZooms) {
                const d = Math.abs(currentZoom - z);
                if (d < diff) { diff = d; closest = z; }
            }
            zoomSelect.value = String(closest);
        }
    };

    const zoomStep = (dir) => {
        const idx = allowedZooms.indexOf(Number(zoomSelect?.value || currentZoom));
        if (idx === -1) return applyZoom(currentZoom);
        const nextIdx = dir > 0 ? Math.min(idx + 1, allowedZooms.length - 1) : Math.max(idx - 1, 0);
        applyZoom(allowedZooms[nextIdx]);
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
        scheduleData = parseRawData(rawDataEl.value);
        if (scheduleData.length === 0) {
            tableContainer.innerHTML = `<div class=\"p-8 text-center text-red-500\">データがありません。</div>`;
            return;
        }
    // Initial unknown-tag notice
    updateNotice();
        const attributes = scheduleData.length > 0 ? Object.keys(scheduleData[0]).filter(key => key !== '学年') : [];
        rowSelector.innerHTML = ''; colSelector.innerHTML = '';
        attributes.forEach(attr => {
            rowSelector.innerHTML += `<option value=\"${attr}\">${attr}</option>`;
            colSelector.innerHTML += `<option value=\"${attr}\">${attr}</option>`;
        });
        if (attributes.includes('講師') && attributes.includes('時限（時間）')) {
            rowSelector.value = '講師';
            colSelector.value = '時限（時間）';
        }
          rawDataEl.addEventListener('input', () => {
              scheduleData = parseRawData(rawDataEl.value);
              updateNotice();
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
        if (panelToggleBtn && panelBody) {
            const collapse = (el) => {
                const cs = getComputedStyle(el);
                const pt = cs.paddingTop;
                const pb = cs.paddingBottom;
                el.dataset.pt = pt;
                el.dataset.pb = pb;
                el.style.boxSizing = 'border-box';
                el.style.height = el.scrollHeight + 'px';
                el.style.opacity = '1';
                // Force reflow
                void el.offsetHeight;
                el.style.transition = 'height 250ms ease, opacity 200ms ease, padding 250ms ease';
                el.style.paddingTop = '0px';
                el.style.paddingBottom = '0px';
                el.style.height = '0px';
                el.style.opacity = '0';
                const onEnd = (ev) => {
                    if (ev.target !== el) return;
                    el.removeEventListener('transitionend', onEnd);
                    el.classList.add('hidden');
                    el.style.transition = '';
                    el.style.height = '';
                    el.style.opacity = '';
                    el.style.paddingTop = '';
                    el.style.paddingBottom = '';
                    el.style.boxSizing = '';
                };
                el.addEventListener('transitionend', onEnd);
            };
            const expand = (el) => {
                const pt = el.dataset.pt || getComputedStyle(el).paddingTop;
                const pb = el.dataset.pb || getComputedStyle(el).paddingBottom;
                el.classList.remove('hidden');
                el.style.boxSizing = 'border-box';
                el.style.height = '0px';
                el.style.opacity = '0';
                el.style.paddingTop = '0px';
                el.style.paddingBottom = '0px';
                // Force reflow
                void el.offsetHeight;
                el.style.transition = 'height 250ms ease, opacity 200ms ease, padding 250ms ease';
                el.style.height = el.scrollHeight + 'px';
                el.style.paddingTop = pt;
                el.style.paddingBottom = pb;
                el.style.opacity = '1';
                const onEnd = (ev) => {
                    if (ev.target !== el) return;
                    el.removeEventListener('transitionend', onEnd);
                    el.style.transition = '';
                    el.style.height = '';
                    el.style.opacity = '';
                    el.style.paddingTop = '';
                    el.style.paddingBottom = '';
                    el.style.boxSizing = '';
                    delete el.dataset.pt;
                    delete el.dataset.pb;
                };
                el.addEventListener('transitionend', onEnd);
            };
            panelToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const expanded = panelToggleBtn.getAttribute('aria-expanded') === 'true';
                panelToggleBtn.setAttribute('aria-expanded', String(!expanded));
                if (expanded) {
                    collapse(panelBody);
                    panelToggleBtn.textContent = '展開する';
                } else {
                    expand(panelBody);
                    panelToggleBtn.textContent = '折りたたむ';
                }
            });
        }
        if (clearDataButton) {
            clearDataButton.addEventListener('click', (e) => {
                e.preventDefault();
                showClearPopover();
            });
        }
        if (clearCancelBtn) {
            clearCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                hideClearPopover();
            });
        }
        if (clearConfirmBtn) {
            clearConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                hideClearPopover();
                // Clear the data and update everything
                rawDataEl.value = '';
                scheduleData = parseRawData('');
                updateNotice();
                // Re-render views with empty state
                tableContainer.innerHTML = `<div class=\"p-8 text-center text-red-500\">データがありません。</div>`;
                cardContainer.innerHTML = '';
            });
        }
        const syncAttendanceToggle = () => {
            if (showAttendanceCheckbox) {
                const enabled = showTagsCheckbox.checked;
                showAttendanceCheckbox.disabled = !enabled;
                // If disabled, leave its checked state as-is; filtering will ignore it when disabled because showTags is false
            }
        };
        showTagsCheckbox.addEventListener('change', () => { syncAttendanceToggle(); setView(currentView); });
        if (showAttendanceCheckbox) showAttendanceCheckbox.addEventListener('change', () => setView(currentView));
        syncAttendanceToggle();
        if (zoomSelect) {
            zoomSelect.addEventListener('change', () => { applyZoom(Number(zoomSelect.value)); renderTableView(); });
        }
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => { zoomStep(1); renderTableView(); });
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { zoomStep(-1); renderTableView(); });
        tableContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.class-card');
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
    // Keep popover in view on scroll/resize
    window.addEventListener('scroll', positionClearPopover, { passive: true });
    window.addEventListener('resize', positionClearPopover);
        if (window.innerWidth < 768) {
            setView('card');
        } else {
            setView('table');
            applyZoom(1);
        }
    };

    initialize();
});
