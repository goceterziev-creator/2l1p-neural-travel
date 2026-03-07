function pad(n){return String(n).padStart(2,'0');} 
function formatDateSafe(dateStr){const d=new Date(dateStr);return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes());} 
module.exports={formatDateSafe}; 
