
import React, { useState, useEffect, useMemo } from 'react';
import { Screen, SlotMap, UserActiveBooking } from './types';
import { getSlots, saveSlots, createBooking, getUserData, cancelBooking } from './services/api';

const Spinner = ({ size = 'md', color = 'blue' }: { size?: 'sm' | 'md' | 'lg', color?: string }) => {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-4', lg: 'w-12 h-12 border-4' };
  const colorClass = color === 'blue' ? 'border-blue-500/20 border-t-blue-500' : 'border-white/20 border-t-white';
  return <div className={`${sizes[size]} ${colorClass} rounded-full animate-spin mx-auto`}></div>;
};

const Header = ({ title, onBack, rightElement }: { title: string; onBack?: () => void; rightElement?: React.ReactNode }) => (
  <header className="px-6 py-4 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
    <div className="flex items-center overflow-hidden">
      {onBack && (
        <button onClick={onBack} className="mr-3 p-2 -ml-2 text-gray-900 active:scale-90 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <h1 className="text-lg font-black text-gray-900 tracking-tight truncate">{title}</h1>
    </div>
    {rightElement}
  </header>
);

const getDaysInMonth = (month: number, year: number) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.CITY_SELECT);
  const [allSlots, setAllSlots] = useState<SlotMap>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Загрузка...');
  const [actionLoading, setActionLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [cityInput, setCityInput] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [activeBooking, setActiveBooking] = useState<UserActiveBooking | null>(null);
  const [userVars, setUserVars] = useState<Record<string, any>>({});

  const [viewingMonth, setViewingMonth] = useState(new Date());

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    initializeData();
  }, []);

  const initializeData = async () => {
    setLoading(true);
    try {
      setSyncStatus('Синхронизация...');
      const extId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
      
      const slotsData = await getSlots();
      setAllSlots(slotsData || {});

      if (extId) {
        const userData = await getUserData(extId);
        if (userData.exists) {
          setFormData({ name: userData.full_name || '', phone: userData.phone || '' });
          if (userData.city) setCityInput(userData.city);
          setUserVars(userData.variables || {});
        }
        if (userData.activeBooking) {
          setActiveBooking(userData.activeBooking);
          setCurrentScreen(Screen.MY_BOOKING);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCitySearch = () => {
    const input = cityInput.trim();
    if (input.toLowerCase() === 'admin123') { setCurrentScreen(Screen.ADMIN); return; }
    const foundCity = Object.keys(allSlots).find(k => k.toLowerCase() === input.toLowerCase() && k !== 'online');
    if (foundCity && (allSlots[foundCity] || []).length > 0) {
      setSelectedCity(foundCity);
      setIsOfflineAvailable(true);
    } else {
      setSelectedCity('');
      setIsOfflineAvailable(false);
    }
    setCurrentScreen(Screen.CITY_RESULT);
  };

  const selectSessionType = (type: 'online' | 'offline') => {
    const cityKey = type === 'online' ? 'online' : (selectedCity || '');
    setSelectedCity(cityKey);
    setSelectedDate(null);
    setSelectedSlot(null);
    setCurrentScreen(Screen.CALENDAR);
  };

  const handleBooking = async () => {
    if (!selectedSlot || !formData.name || !formData.phone) return;
    setActionLoading(true);
    const d = new Date(selectedSlot);
    const formatted = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    
    const extId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || '';
    const ok = await createBooking({
      type: selectedCity === 'online' ? 'Online' : 'Offline',
      city: selectedCity === 'online' ? 'Онлайн' : selectedCity,
      slot: formatted,
      full_name: formData.name,
      phone: formData.phone,
      external_id: extId
    });

    if (ok) {
      const updated = { ...allSlots, [selectedCity]: (allSlots[selectedCity] || []).filter(s => s !== selectedSlot) };
      await saveSlots(updated);
      setAllSlots(updated);
      setIsSuccess(true);
    } else {
      window.Telegram?.WebApp?.showAlert("Ошибка записи.");
    }
    setActionLoading(false);
  };

  const handleCancelOrReschedule = async (isRescheduling = false) => {
    if (!activeBooking) return;
    const extId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || '';
    
    const confirmMsg = isRescheduling ? "Перенести на другое число?" : "Вы уверены, что хотите отменить запись?";
    window.Telegram?.WebApp?.showConfirm(confirmMsg, async (ok) => {
      if (ok) {
        setActionLoading(true);
        const [datePart, timePart] = activeBooking.slot.split(' ');
        const [d, m, y] = datePart.split('.').map(Number);
        const [h, min] = timePart.split(':').map(Number);
        const reconstructedIso = new Date(y, m - 1, d, h, min).toISOString();

        const success = await cancelBooking(extId, activeBooking.city === 'Онлайн' ? 'online' : activeBooking.city, reconstructedIso);
        
        if (success) {
          const originalCity = activeBooking.city === 'Онлайн' ? 'online' : activeBooking.city;
          setActiveBooking(null);
          if (isRescheduling) {
            setSelectedCity(originalCity);
            setSelectedDate(null);
            setSelectedSlot(null);
            setCurrentScreen(Screen.CALENDAR);
          } else {
            setCurrentScreen(Screen.CITY_SELECT);
          }
        }
        setActionLoading(false);
      }
    });
  };

  const availableDatesInMonth = useMemo(() => {
    if (!selectedCity || !allSlots[selectedCity]) return new Set<string>();
    return new Set(allSlots[selectedCity].map(s => new Date(s).toDateString()));
  }, [selectedCity, allSlots]);

  const slotsForDate = useMemo(() => {
    if (!selectedCity || !selectedDate || !allSlots[selectedCity]) return [];
    return allSlots[selectedCity].filter(s => new Date(s).toDateString() === selectedDate).sort();
  }, [selectedCity, selectedDate, allSlots]);

  const changeMonth = (offset: number) => {
    const newMonth = new Date(viewingMonth);
    newMonth.setMonth(newMonth.getMonth() + offset);
    setViewingMonth(newMonth);
  };

  const renderCalendarGrid = (onDateClick: (date: Date) => void, isSelected: (date: Date) => boolean) => {
    const days = getDaysInMonth(viewingMonth.getMonth(), viewingMonth.getFullYear());
    const firstDay = new Date(viewingMonth.getFullYear(), viewingMonth.getMonth(), 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    return (
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} className="text-[10px] font-black text-black uppercase pb-2">{d}</div>
        ))}
        {Array(offset).fill(null).map((_, i) => <div key={`off-${i}`} />)}
        {days.map(date => {
          const dStr = date.toDateString();
          const selected = isSelected(date);
          const hasSlots = availableDatesInMonth.has(dStr);
          return (
            <button
              key={dStr}
              onClick={() => onDateClick(date)}
              className={`h-11 rounded-xl text-sm font-black transition-all flex flex-col items-center justify-center border ${
                selected ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-100 text-black active:bg-blue-50'
              }`}
            >
              <span className="leading-none">{date.getDate()}</span>
              {hasSlots && !selected && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1" />}
            </button>
          );
        })}
      </div>
    );
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white space-y-4">
      <Spinner size="lg" />
      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{syncStatus}</p>
    </div>
  );

  if (isSuccess) return (
    <div className="h-screen flex flex-col items-center justify-center p-8 text-center bg-white animate-fade-in">
      <div className="w-24 h-24 bg-green-500 rounded-[2.5rem] flex items-center justify-center text-white shadow-xl shadow-green-100 mb-8 animate-bounce">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2 text-black uppercase">Успешно!</h2>
      <button onClick={() => window.Telegram?.WebApp?.close()} className="w-full py-6 bg-black text-white rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all uppercase tracking-tight">Закрыть</button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white font-sans animate-fade-in flex flex-col">
      
      {currentScreen === Screen.MY_BOOKING && activeBooking && (
        <div className="p-8 flex flex-col flex-1">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-3xl font-black text-black tracking-tighter uppercase">Вы уже записаны</h1>
            {Object.keys(userVars).length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {Object.entries(userVars).map(([k, v]) => (
                  <span key={k} className="px-3 py-1 bg-blue-50 text-blue-600 text-[9px] font-black rounded-full uppercase border border-blue-100">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="w-full bg-blue-600 p-8 rounded-[3rem] border-4 border-white shadow-2xl text-white space-y-6 mb-8 ring-4 ring-blue-50">
            <div className="space-y-1 text-center">
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Место и формат</label>
              <div className="text-2xl font-black">{activeBooking.type} — {activeBooking.city}</div>
            </div>
            <div className="h-px bg-blue-400/30 w-full"></div>
            <div className="space-y-1 text-center">
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Дата и время</label>
              <div className="text-3xl font-black leading-tight">{activeBooking.slot}</div>
            </div>
          </div>

          <div className="w-full space-y-4 mt-auto">
            <button onClick={() => setCurrentScreen(Screen.CITY_SELECT)} className="w-full py-6 bg-black text-white rounded-[2rem] font-black text-xl shadow-xl active:scale-95 transition-all uppercase">
              ✨ Записаться еще раз
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleCancelOrReschedule(true)} className="py-5 bg-white border-4 border-gray-100 text-blue-600 rounded-[2rem] font-black text-sm active:bg-blue-50 transition-all uppercase">
                Перенести
              </button>
              <button onClick={() => handleCancelOrReschedule(false)} className="py-5 bg-white border-4 border-red-50 text-red-500 rounded-[2rem] font-black text-sm active:bg-red-50 transition-all uppercase">
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {currentScreen === Screen.CITY_SELECT && (
        <div className="p-8 flex flex-col items-center justify-center flex-1 space-y-12">
          <div className="text-center space-y-6">
            <div className="inline-flex p-6 bg-blue-50 rounded-[2.5rem] text-blue-500 shadow-sm">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <h1 className="text-4xl font-black text-black tracking-tighter">Ваш город?</h1>
          </div>
          <div className="w-full space-y-4">
            <input type="text" placeholder="Напр. Москва" value={cityInput} onChange={e => setCityInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCitySearch()} className="w-full p-6 rounded-3xl bg-gray-50 border-4 border-transparent focus:border-blue-500 text-center font-black text-2xl text-black outline-none" />
            <button onClick={handleCitySearch} className="w-full py-5 bg-blue-500 text-white rounded-2xl font-black text-xl shadow-xl active:scale-95 transition-all">Проверить</button>
            {activeBooking && <button onClick={() => setCurrentScreen(Screen.MY_BOOKING)} className="w-full text-blue-500 font-black text-[10px] uppercase tracking-widest py-2">Моя текущая запись</button>}
          </div>
        </div>
      )}

      {currentScreen === Screen.CITY_RESULT && (
        <div className="p-8 flex flex-col items-center justify-center flex-1 space-y-10 text-center">
          {isOfflineAvailable ? (
            <>
              <div className="p-6 bg-green-50 rounded-[2.5rem] text-green-500"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div>
              <h2 className="text-2xl font-black text-black">В городе {selectedCity} есть оффлайн сессии!</h2>
              <div className="w-full space-y-3">
                <button onClick={() => selectSessionType('offline')} className="w-full py-5 bg-blue-500 text-white rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all">📍 Оффлайн сессия</button>
                <button onClick={() => selectSessionType('online')} className="w-full py-5 bg-white border-4 border-gray-100 text-blue-600 rounded-2xl font-black text-lg active:bg-gray-50 transition-all">🌐 Онлайн сессия</button>
              </div>
            </>
          ) : (
            <>
              <div className="p-6 bg-orange-50 rounded-[2.5rem] text-orange-500"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></div>
              <h2 className="text-2xl font-black text-black">Оффлайн сессий нет, но доступен Онлайн</h2>
              <button onClick={() => selectSessionType('online')} className="w-full py-5 bg-blue-500 text-white rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all">🌐 Записаться онлайн</button>
            </>
          )}
          <button onClick={() => setCurrentScreen(Screen.CITY_SELECT)} className="text-gray-400 font-bold text-xs uppercase tracking-widest">Назад</button>
        </div>
      )}

      {currentScreen === Screen.CALENDAR && (
        <div className="flex flex-col flex-1 bg-white overflow-hidden">
          <Header title={selectedCity === 'online' ? "Онлайн" : `📍 ${selectedCity}`} onBack={() => setCurrentScreen(Screen.CITY_RESULT)} />
          <div className="p-6 flex-1 flex flex-col space-y-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <button onClick={() => changeMonth(-1)} className="p-3 bg-black text-white rounded-2xl shadow-lg active:scale-90 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M15 19l-7-7 7-7" /></svg></button>
              <div className="text-center">
                <div className="text-xl font-black text-black capitalize">{viewingMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</div>
              </div>
              <button onClick={() => changeMonth(1)} className="p-3 bg-black text-white rounded-2xl shadow-lg active:scale-90 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M9 5l7 7-7 7" /></svg></button>
            </div>

            <div className="p-5 border-4 border-gray-100 rounded-[2.5rem] bg-gray-50 shadow-inner">
              {renderCalendarGrid(
                (date) => { setSelectedDate(date.toDateString()); setSelectedSlot(null); },
                (date) => selectedDate === date.toDateString()
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
               {selectedDate ? (
                 slotsForDate.length > 0 ? (
                   <div className="grid grid-cols-4 gap-2 pb-24">
                    {slotsForDate.map(s => (
                      <button key={s} onClick={() => setSelectedSlot(s)} className={`py-4 rounded-xl font-black text-sm border-2 ${selectedSlot === s ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-gray-100 text-black'}`}>
                        {new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                  </div>
                 ) : (
                   <div className="text-center py-8 opacity-40 font-black text-sm uppercase text-black">Мест нет</div>
                 )
              ) : (
                <div className="flex flex-col items-center justify-center py-8 opacity-40 text-center text-black">
                  <p className="font-black text-[10px] uppercase">Выберите дату на календаре</p>
                </div>
              )}
            </div>
          </div>
          {selectedSlot && (
            <div className="p-6 bg-white border-t border-gray-100 fixed bottom-0 left-0 right-0 z-50 animate-fade-in shadow-2xl">
              <button onClick={() => setCurrentScreen(Screen.BOOKING_FORM)} className="w-full py-5 bg-blue-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-100 active:scale-95 transition-all">Далее</button>
            </div>
          )}
        </div>
      )}

      {currentScreen === Screen.BOOKING_FORM && (
        <div className="flex flex-col flex-1 bg-white">
          <Header title="Данные для записи" onBack={() => setCurrentScreen(Screen.CALENDAR)} />
          <div className="p-8 space-y-6">
            <div className="bg-blue-50 p-6 rounded-3xl border-2 border-blue-100">
               <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Слот</div>
               <div className="text-blue-900 font-black text-lg">{selectedSlot && new Date(selectedSlot).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div className="space-y-1 text-black">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">Имя</label>
              <input type="text" placeholder="Введите имя" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-5 bg-gray-50 rounded-2xl font-black text-black outline-none border-4 border-transparent focus:border-blue-500" />
            </div>
            <div className="space-y-1 text-black">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">Телефон</label>
              <input type="tel" placeholder="+7..." value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-5 bg-gray-50 rounded-2xl font-black text-black outline-none border-4 border-transparent focus:border-blue-500" />
            </div>
            <button onClick={handleBooking} disabled={actionLoading || !formData.name || !formData.phone} className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-2xl disabled:opacity-50 active:scale-95 transition-all">
              {actionLoading ? <Spinner color="white" /> : 'Подтвердить запись'}
            </button>
          </div>
        </div>
      )}

      {actionLoading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}
    </div>
  );
};

export default App;
