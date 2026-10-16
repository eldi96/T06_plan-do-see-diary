import {requireSession,authJson} from '../../../lib/auth-server';
import {koreanHolidays} from '../../../lib/korean-holidays';
export async function GET(request:Request){
 try{
  if(!await requireSession(request))return authJson({error:'로그인이 필요합니다.'},401);
  const year=Number(new URL(request.url).searchParams.get('year'));
  if(!Number.isInteger(year)||year<1900||year>2100)return authJson({error:'연도를 확인해 주세요.'},400);
  return authJson({holidays:koreanHolidays(year)});
 }catch{return authJson({error:'공휴일 정보를 불러오지 못했습니다.'},503);}
}
