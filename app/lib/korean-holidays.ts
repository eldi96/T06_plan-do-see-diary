import Holidays from 'date-holidays';
import {addDays,seoulToday} from '../domain/dates';

// Library data is bundled on the server; visitors never need an external API key.
const calendar=new Holidays('KR');
const cache=new Map<number,Record<string,string>>();
export function koreanHolidays(year:number):Record<string,string>{
 if(!Number.isInteger(year)||year<1900||year>2100)throw Error('연도를 확인해 주세요.');
 const found=cache.get(year);if(found)return found;
 const result:Record<string,string>={};
 for(const holiday of calendar.getHolidays(year).filter(h=>h.type==='public')){
  // date-holidays KR anchors Seollal at lunar day 1; the 3-day break starts a day earlier.
  // https://github.com/commenthol/date-holidays/issues/640
  const offset=holiday.name==='설날'?-1:0;
  const start=addDays(seoulToday(holiday.start),offset),end=addDays(seoulToday(holiday.end),offset);
  for(let day=start;day<end;day=addDays(day,1)){
   if(day.startsWith(String(year)))result[day]=[result[day],holiday.name].filter(Boolean).join(' · ');
  }
 }
 // Official additions not yet present in the library's KR rules.
 // https://www.korea.kr/news/policyNewsView.do?newsId=148963568
 if(year>=2026)result[`${year}-05-01`]='노동절';
 // National Election Commission: 2026 nationwide local elections.
 // https://www.nec.go.kr/portal/contents.do?menuNo=2000010
 if(year===2026)result['2026-06-03']='전국동시지방선거';
 if(cache.size>=4)cache.delete(cache.keys().next().value!);
 cache.set(year,result);return result;
}
