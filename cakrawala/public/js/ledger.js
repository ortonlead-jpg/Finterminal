(function(root){
 function replay(transactions){
  if(!Array.isArray(transactions)||transactions.length>10000)throw new Error('Daftar transaksi tidak valid.');
  const holdings={};let realized=0;
  for(const t of [...transactions].sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id-b.id)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!Number.isFinite(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date)throw new Error('Tanggal transaksi tidak valid.');
   if(!/^[A-Z0-9^][A-Z0-9.^=\-]{0,23}$/.test(t.symbol)||!['BUY','SELL'].includes(t.side)||!Number.isSafeInteger(t.qty)||t.qty<=0||!Number.isFinite(t.price)||t.price<=0||!Number.isFinite(t.fee??0)||(t.fee??0)<0)throw new Error('Simbol, jumlah, harga, atau biaya transaksi tidak valid.');
   const p=holdings[t.symbol]||(holdings[t.symbol]={symbol:t.symbol,qty:0,cost:0});
   if(t.side==='BUY'){p.cost+=t.qty*t.price+(t.fee||0);p.qty+=t.qty;}
   else{if(t.qty>p.qty)throw new Error(`Penjualan ${t.symbol} pada ${t.date} melebihi posisi pada tanggal tersebut.`);const avg=p.cost/p.qty;realized+=t.qty*(t.price-avg)-(t.fee||0);p.cost-=avg*t.qty;p.qty-=t.qty;}
  }
  return {list:Object.values(holdings).filter(p=>p.qty>0).map(p=>({...p,avg:p.cost/p.qty})),realized};
 }
 function validateOrder(side,lots,price,feeBuy,feeSell){if(!['BUY','SELL'].includes(side)||!Number.isSafeInteger(lots)||lots<=0||!Number.isFinite(price)||price<=0||![feeBuy,feeSell].every(f=>Number.isFinite(f)&&f>=0&&f<=100))throw new Error('Order ditolak: lot harus bilangan bulat positif, harga dan fee harus valid.');}
 root.Ledger={replay,validateOrder};if(typeof module!=='undefined')module.exports=root.Ledger;
})(typeof window!=='undefined'?window:globalThis);
