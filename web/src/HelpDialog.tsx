import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs } from '@mui/material';

const sections = [
  { id: 'start', label: 'Быстрый старт' },
  { id: 'factors', label: 'Факторы' },
  { id: 'results', label: 'Результаты' },
] as const;

type Section = (typeof sections)[number]['id'];

function StartGuide() {
  return <>
    <div className="help-highlight">
      <h3>Первый расчет</h3>
      <p>В «Моделировании» задайте <b>N = 500</b>, <b>p₀ = 0,3</b> и <b>T = 100</b>. Оставьте факторы выключенными и нажмите «Запустить». На графике частота p останется равной 0,3 во всех поколениях.</p>
    </div>
    <dl className="help-terms">
      <div><dt>N</dt><dd>Число особей. У каждой особи две копии гена.</dd></div>
      <div><dt>p₀</dt><dd>Начальная частота аллеля A. Частота аллеля a равна q = 1 − p.</dd></div>
      <div><dt>T</dt><dd>Число поколений после начального. На графике и в таблице показаны поколения от 0 до T.</dd></div>
    </dl>
    <p>Попробовать готовый расчет можно в разделе «Примеры». Там уже заданы параметры и включены нужные факторы.</p>
  </>;
}

function FactorsGuide() {
  return <div className="help-grid">
    <section className="help-card">
      <h3>Миграция</h3>
      <p>В каждом поколении доля m популяции приходится на мигрантов. Частота аллеля A приближается к их частоте pₘ. После миграции она равна (1 − m)p + m·pₘ.</p>
    </section>
    <section className="help-card">
      <h3>Отбор</h3>
      <p>Значения w₁₁, w₁₂ и w₂₂ задают приспособленность генотипов AA, Aa и aa. При достижении цели p* приложение покажет первое такое поколение. Если включена миграция, отбор применяется после нее.</p>
    </section>
    <section className="help-card">
      <h3>Неслучайное скрещивание</h3>
      <p>При увеличении коэффициента инбридинга F доля гетерозигот Aa снижается до 2pq(1 − F). Сам по себе инбридинг сохраняет частоты аллелей.</p>
    </section>
    <section className="help-card">
      <h3>Генетический дрейф</h3>
      <p>В каждом поколении случайно выбираются 2N копий аллелей. В малой популяции частоты меняются сильнее. Повторите расчет с теми же параметрами и зерном, чтобы получить ту же траекторию.</p>
    </section>
  </div>;
}

function ResultsGuide() {
  return <>
    <dl className="help-terms help-results">
      <div><dt>Частоты и генотипы</dt><dd>На графиках видны частоты аллелей A и a и доли генотипов AA, Aa, aa. При случайном скрещивании ожидаемые доли равны p², 2pq и q².</dd></div>
      <div><dt>Гетерозиготность</dt><dd>H = 2pq — ожидаемая доля гетерозигот при случайном скрещивании. При инбридинге график также показывает долю Aa в модели, при нейтральном дрейфе — среднюю H по теории.</dd></div>
      <div><dt>Критерий χ²</dt><dd>В «Моделировании» показывает, насколько рассчитанные численности отличаются от ожидаемых при равновесии. Для наблюдаемых численностей AA, Aa и aa откройте «Проверка выборки». Если критерий применим, значение выше 3,84 означает значимое отклонение.</dd></div>
      <div><dt>Многократные прогоны</dt><dd>Коридор от 5-го до 95-го процентиля показывает, как частота p различается между прогонами в каждом поколении.</dd></div>
    </dl>
    <p>Кнопка «В сравнение» добавляет результат к другим сценариям. Через «Экспорт» можно сохранить таблицу в CSV или XLSX, а текущий график в PNG.</p>
  </>;
}

export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>('start');

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="help-title"
    slotProps={{ paper: { className: 'help-dialog' } }}>
    <DialogTitle id="help-title">Справка</DialogTitle>
    <Tabs value={section} onChange={(_, value: Section) => setSection(value)} aria-label="Разделы справки"
      variant="fullWidth" className="help-tabs">
      {sections.map(({ id, label }) => <Tab key={id} id={`help-tab-${id}`} aria-controls={`help-panel-${id}`} value={id} label={label} />)}
    </Tabs>
    <DialogContent dividers className="help-content">
      <div role="tabpanel" id="help-panel-start" aria-labelledby="help-tab-start" hidden={section !== 'start'} tabIndex={section === 'start' ? 0 : undefined}>
        <StartGuide />
      </div>
      <div role="tabpanel" id="help-panel-factors" aria-labelledby="help-tab-factors" hidden={section !== 'factors'} tabIndex={section === 'factors' ? 0 : undefined}>
        <FactorsGuide />
      </div>
      <div role="tabpanel" id="help-panel-results" aria-labelledby="help-tab-results" hidden={section !== 'results'} tabIndex={section === 'results' ? 0 : undefined}>
        <ResultsGuide />
      </div>
    </DialogContent>
    <DialogActions><Button variant="contained" onClick={onClose}>Закрыть</Button></DialogActions>
  </Dialog>;
}
