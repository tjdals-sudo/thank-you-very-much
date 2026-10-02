// 날씨 (Open-Meteo, 무료·키 불필요)
(function () {
  const C = window.APP_CONFIG || {};
  // WMO weather code → 아이콘, 설명, 한 줄 문구
  const MAP = [
    [[0], "☀️", "맑음", "하늘이 맑아요. 오늘 햇살 한 줌에도 감사!"],
    [[1], "🌤️", "대체로 맑음", "구름 사이로 해가 보여요. 좋은 하루!"],
    [[2], "⛅", "구름 조금", "구름 조금, 마음은 맑게 가볼까요?"],
    [[3], "☁️", "흐림", "흐린 날엔 따뜻한 말 한마디가 햇살이에요"],
    [[45, 48], "🌫️", "안개", "안개 낀 아침, 천천히 조심히 가요"],
    [[51, 53, 55, 56, 57], "🌦️", "이슬비", "이슬비 내려요. 우산 챙겼나요?"],
    [[61, 63, 65, 66, 67], "🌧️", "비", "비 오는 날, 빗소리 들으며 감사 하나 적어봐요"],
    [[71, 73, 75, 77], "🌨️", "눈", "눈이 와요! 미끄러우니 조심조심"],
    [[80, 81, 82], "🌧️", "소나기", "소나기 지나가면 하늘이 더 맑아져요"],
    [[85, 86], "❄️", "눈보라", "눈 많이 와요. 따뜻하게 입어요"],
    [[95, 96, 99], "⛈️", "천둥번개", "천둥 치는 날, 안전한 곳에 있어요"]
  ];
  function describe(code) {
    for (const [codes, icon, desc, phrase] of MAP) if (codes.includes(code)) return { icon, desc, phrase };
    return { icon: "🌡️", desc: "날씨", phrase: "오늘도 좋은 하루 보내요" };
  }
  function getPosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      const t = setTimeout(() => resolve(null), 5000);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        () => { clearTimeout(t); resolve(null); },
        { timeout: 5000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }
  // 반환: { icon, desc, phrase, temp, isCurrentLocation } 또는 실패 시 null
  window.fetchWeather = async function () {
    try {
      const pos = await getPosition();
      const lat = pos ? pos.lat : C.DEFAULT_LAT, lon = pos ? pos.lon : C.DEFAULT_LON;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FSeoul`;
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(url, { signal: ctrl.signal }); clearTimeout(t);
      if (!res.ok) return null;
      const j = await res.json();
      const cur = j.current || {};
      if (typeof cur.temperature_2m !== "number") return null;
      const d = describe(cur.weather_code);
      let phrase = d.phrase;
      if (cur.temperature_2m >= 30) phrase = "많이 더워요. 물 자주 마시고 시원하게!";
      else if (cur.temperature_2m <= 0) phrase = "영하예요. 따뜻하게 입고 나가요";
      return { ...d, phrase, temp: Math.round(cur.temperature_2m), isCurrentLocation: !!pos };
    } catch { return null; }
  };
})();
