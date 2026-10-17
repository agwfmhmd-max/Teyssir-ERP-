/* Teyssir ERP — Excel historical data importer
   Adds a guided import workflow without replacing existing ERP screens or workflows. */
(function () {
  "use strict";
  const CATS = {
    products: { label: "المنتجات والمخزون", collection: "products", fields: [
      ["name","اسم المنتج","name,product,product name,المنتج,اسم المنتج,article,désignation"],
      ["buyPrice","سعر الشراء","buyprice,buy price,cost,سعر الشراء,ثمن الشراء,prix achat"],
      ["sellPrice","سعر البيع","sellprice,sell price,price,سعر البيع,ثمن البيع,prix vente"],
      ["stock","الكمية الحالية","stock,quantity,qty,الكمية,الكمية الحالية,quantité,qte"],
      ["expiryDate","تاريخ انتهاء الصلاحية (اختياري)","expirydate,expiry date,expiration,expiry,تاريخ انتهاء الصلاحية,تاريخ الانتهاء,date expiration"],
      ["unit","وحدة القياس (اختياري)","unit,unité,الوحدة,وحدة القياس"],
      ["category","التصنيف (اختياري)","category,catégorie,التصنيف,الصنف"]
    ]},
    customers: { label: "الزبناء", collection: "customers", fields: [
      ["name","اسم الزبون","name,customer,client,الاسم,اسم الزبون,اسم العميل"],
      ["phone","الهاتف","phone,tel,telephone,téléphone,الهاتف,رقم الهاتف"],
      ["balance","الرصيد السابق (اختياري)","balance,solde,الرصيد,الرصيد السابق,المستحق"]
    ]},
    suppliers: { label: "الموردون", collection: "suppliers", fields: [
      ["name","اسم المورد","name,supplier,fournisseur,اسم المورد,المورد"],
      ["phone","الهاتف","phone,tel,telephone,téléphone,الهاتف,رقم الهاتف"],
      ["balance","الرصيد السابق (اختياري)","balance,solde,الرصيد,الرصيد السابق,المستحق"]
    ]},
    banks: { label: "البنوك والحسابات", collection: "banks", fields: [
      ["name","اسم البنك أو الحساب","name,bank,bank name,اسم البنك,اسم الحساب,البنك"],
      ["accountNumber","رقم الحساب (اختياري)","accountnumber,account number,numero compte,رقم الحساب"],
      ["balance","الرصيد الافتتاحي","balance,solde,الرصيد,الرصيد الافتتاحي"]
    ]},
    employees: { label: "الموظفون والرواتب الأساسية", collection: "salaries", fields: [
      ["name","اسم الموظف","name,employee,employé,اسم الموظف,الاسم"],
      ["phone","الهاتف (اختياري)","phone,tel,telephone,الهاتف,رقم الهاتف"],
      ["baseSalary","الراتب الأساسي","basesalary,base salary,salary,salaire,الراتب الأساسي,الراتب"],
      ["defaultMethod","طريقة الدفع: cash أو bank (اختياري)","defaultmethod,method,طريقة الدفع"]
    ]},
    expenses: { label: "المصروفات التاريخية", collection: "expenses", fields: [
      ["date","تاريخ المصروف","date,createdat,date dépense,التاريخ,تاريخ المصروف"],
      ["name","نوع أو اسم المصروف","name,category,catégorie,type,اسم المصروف,التصنيف,نوع المصروف"],
      ["note","الوصف (اختياري)","note,description,الوصف,ملاحظات"],
      ["amount","المبلغ","amount,amount mru,montant,valeur,المبلغ,القيمة"],
      ["method","طريقة الدفع: cash أو bank (اختياري)","method,mode,طريقة الدفع"],
      ["bankName","اسم البنك (اختياري)","bankname,bank,اسم البنك"]
    ]},
    revenues: { label: "الإيرادات التاريخية", collection: "transactions", fields: [
      ["date","تاريخ الإيراد","date,createdat,date revenu,التاريخ,تاريخ الإيراد"],
      ["name","مصدر أو اسم الإيراد","name,source,category,اسم الإيراد,المصدر,التصنيف"],
      ["note","الوصف (اختياري)","note,description,الوصف,ملاحظات"],
      ["amount","المبلغ","amount,montant,valeur,المبلغ,القيمة"],
      ["method","طريقة القبض: cash أو bank (اختياري)","method,mode,طريقة القبض"],
      ["bankName","اسم البنك (اختياري)","bankname,bank,اسم البنك"]
    ]},
    salaryPayments: { label: "سجل الرواتب المدفوعة سابقًا", collection: "transactions", fields: [
      ["date","تاريخ دفع الراتب","date,createdat,paydate,date paiement,التاريخ,تاريخ الدفع"],
      ["name","اسم الموظف","name,employee,employé,اسم الموظف,الاسم"],
      ["amount","المبلغ المدفوع","amount,montant,paid,المبلغ,المبلغ المدفوع"],
      ["note","ملاحظات (اختياري)","note,description,الوصف,ملاحظات"]
    ]}
  };
  const norm = v => String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s_\-./]+/g,"");
  const num = v => {
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    const s = String(v == null ? "" : v).replace(/[\s٬,]/g,"").replace(/[٫]/g,".");
    if (!s) return 0;
    return Number(s);
  };
  const dateValue = v => {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
    if (typeof v === "number" && window.XLSX && XLSX.SSF) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return s.slice(0,10);
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      let a=+m[1], b=+m[2], y=+m[3]; if(y<100)y+=2000;
      // Common spreadsheet date convention: DD/MM/YYYY
      return `${y}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;
    }
    const d = new Date(s);
    return isNaN(d) ? "" : d.toISOString().slice(0,10);
  };
  function hash(str) { let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,"0"); }
  function safeId(cat, row) {
    const identity = cat + "|" + (row.name||"") + "|" + (row.phone||"") + "|" + (row.accountNumber||"") + "|" + (row.date||"") + "|" + (row.amount||"") + "|" + (row.expiryDate||"");
    return "excel_" + hash(identity.toLowerCase());
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  let rows = [], headers = [], selectedCat = "products", lastFile = "";
  function injectStyle() {
    if (document.getElementById("tei-import-style")) return;
    const st=document.createElement("style"); st.id="tei-import-style";
    st.textContent = `
      #teiImportLauncher{position:fixed;left:18px;bottom:18px;z-index:9990;border:0;border-radius:14px;padding:12px 16px;background:linear-gradient(135deg,#173f7a,#127f91);color:#fff;font:700 14px Tajawal,sans-serif;box-shadow:0 8px 24px #173f7a40;cursor:pointer}
      #teiImportLauncher i{margin-inline-end:7px}
      #teiImportOverlay{position:fixed;inset:0;z-index:9999;background:#0b1738a8;display:none;align-items:center;justify-content:center;padding:14px;font-family:Tajawal,sans-serif}
      #teiImportOverlay .tei-card{background:#fff;color:#1f2937;width:min(900px,100%);max-height:92vh;overflow:auto;border-radius:20px;box-shadow:0 25px 80px #07152e55}
      #teiImportOverlay .tei-head{background:linear-gradient(120deg,#173f7a,#147f89);color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px}
      #teiImportOverlay .tei-head h2{margin:0;font-size:20px}
      #teiImportOverlay .tei-body{padding:20px}
      #teiImportOverlay .tei-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #teiImportOverlay .tei-field label{display:block;font-size:13px;font-weight:700;margin-bottom:6px}
      #teiImportOverlay .tei-field select,#teiImportOverlay .tei-field input{width:100%;padding:11px;border:1px solid #d6deea;border-radius:10px;background:#fff;font:inherit}
      #teiImportOverlay .tei-btn{border:0;border-radius:10px;padding:11px 16px;font:700 14px Tajawal,sans-serif;cursor:pointer}
      #teiImportOverlay .tei-primary{background:#173f7a;color:white}
      #teiImportOverlay .tei-secondary{background:#edf2f8;color:#173f7a}
      #teiImportOverlay .tei-danger{background:#fff0f0;color:#a32323}
      #teiImportOverlay .tei-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
      #teiImportOverlay .tei-note{background:#f3f7fc;border:1px solid #dbe6f3;border-radius:12px;padding:12px;font-size:13px;line-height:1.7;margin:12px 0}
      #teiImportOverlay .tei-tablewrap{overflow:auto;max-height:280px;border:1px solid #e5eaf1;border-radius:10px;margin-top:12px}
      #teiImportOverlay table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}
      #teiImportOverlay th,#teiImportOverlay td{padding:8px;border-bottom:1px solid #e8edf4;text-align:right}
      #teiImportOverlay th{background:#f1f5f9;position:sticky;top:0}
      #teiImportOverlay .tei-status{margin-top:12px;font-weight:700;white-space:pre-wrap;line-height:1.7}
      #teiImportOverlay .tei-close{border:0;background:#ffffff20;color:white;border-radius:10px;padding:8px 12px;font-size:18px;cursor:pointer}
      @media(max-width:600px){#teiImportOverlay .tei-grid{grid-template-columns:1fr}#teiImportLauncher{left:10px;bottom:10px;padding:10px 12px}}
    `;
    document.head.appendChild(st);
  }
  function addLauncher() {
    if (document.getElementById("teiImportLauncher") || !window.app || !app.state || !app.state.cid) return;
    const b=document.createElement("button"); b.id="teiImportLauncher"; b.innerHTML='<i class="fa-solid fa-file-excel"></i> استيراد بيانات Excel'; b.onclick=openModal;
    document.body.appendChild(b);
  }
  function ensureModal() {
    if(document.getElementById("teiImportOverlay")) return;
    const el=document.createElement("div"); el.id="teiImportOverlay";
    el.innerHTML=`<div class="tei-card" role="dialog" aria-modal="true" aria-label="استيراد Excel">
      <div class="tei-head"><div><h2><i class="fa-solid fa-file-excel"></i> استيراد البيانات السابقة</h2><div style="font-size:12px;opacity:.9;margin-top:4px">Teyssir ERP · معاينة وتحقق قبل الحفظ</div></div><button class="tei-close" id="teiImportClose" aria-label="إغلاق">×</button></div>
      <div class="tei-body">
        <div class="tei-note">اختر نوع البيانات ثم ارفع ملف Excel بصيغة XLSX أو XLS أو CSV. راجع المعاينة والأخطاء قبل التنفيذ. لا تُنشأ عمليات قبض أو دفع نقدية تلقائيًا عند استيراد السجلات التاريخية، لتجنب تغيير الأرصدة دون قصد.</div>
        <div class="tei-grid">
          <div class="tei-field"><label for="teiCat">نوع البيانات</label><select id="teiCat"></select></div>
          <div class="tei-field"><label for="teiFile">ملف Excel</label><input id="teiFile" type="file" accept=".xlsx,.xls,.csv"></div>
        </div>
        <div id="teiMapping"></div><div id="teiPreview"></div><div id="teiStatus" class="tei-status" aria-live="polite"></div>
        <div class="tei-actions"><button class="tei-btn tei-secondary" id="teiTemplate">تنزيل قالب CSV</button><button class="tei-btn tei-secondary" id="teiValidate">فحص ومعاينة</button><button class="tei-btn tei-primary" id="teiImport" disabled>استيراد السجلات الصحيحة</button><button class="tei-btn tei-danger" id="teiReset">إعادة ضبط</button></div>
      </div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click",e=>{if(e.target===el) closeModal();});
    document.getElementById("teiImportClose").onclick=closeModal;
    document.getElementById("teiCat").innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join("");
    document.getElementById("teiCat").onchange=()=>{selectedCat=document.getElementById("teiCat").value; renderMapping(); renderPreview();};
    document.getElementById("teiFile").onchange=readFile;
    document.getElementById("teiTemplate").onclick=downloadTemplate;
    document.getElementById("teiValidate").onclick=validateAndPreview;
    document.getElementById("teiImport").onclick=runImport;
    document.getElementById("teiReset").onclick=()=>{rows=[];headers=[];lastFile="";document.getElementById("teiFile").value="";document.getElementById("teiStatus").textContent="";document.getElementById("teiImport").disabled=true;renderMapping();renderPreview();};
  }
  function openModal() {
    if(!window.app || !app.state || !app.state.cid){alert("يرجى تسجيل الدخول إلى الشركة أولًا.");return;}
    injectStyle();ensureModal();selectedCat=document.getElementById("teiCat").value||"products";
    document.getElementById("teiImportOverlay").style.display="flex"; renderMapping(); renderPreview();
  }
  function closeModal(){const e=document.getElementById("teiImportOverlay");if(e)e.style.display="none";}
  function downloadTemplate(){
    const cat=document.getElementById("teiCat").value, c=CATS[cat];
    const csv=c.fields.map(f=>`"${f[1].replace(/"/g,'""')}"`).join(",")+"\r\n";
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Teyssir-${cat}-template.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function readFile(e){
    const file=e.target.files&&e.target.files[0]; if(!file)return;
    if(!window.XLSX){setStatus("تعذر تحميل قارئ Excel. اتصل بالإنترنت ثم أعد المحاولة.");return;}
    lastFile=file.name;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array",cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
        if(!json.length)throw new Error("الملف فارغ.");
        headers=json[0].map((h,i)=>String(h||`عمود ${i+1}`).trim());
        rows=json.slice(1).filter(r=>r.some(v=>String(v??"").trim()!=="")).map((r,i)=>({_sourceRow:i+2, _raw:r}));
        renderMapping();validateAndPreview();
      }catch(err){rows=[];headers=[];setStatus("تعذر قراءة الملف: "+err.message);renderPreview();}
    };
    reader.readAsArrayBuffer(file);
  }
  function renderMapping(){
    const c=CATS[document.getElementById("teiCat")?.value||selectedCat];
    const box=document.getElementById("teiMapping");if(!box)return;
    if(!headers.length){box.innerHTML="";return;}
    box.innerHTML=`<div class="tei-note"><b>مطابقة الأعمدة:</b> حاول النظام مطابقة أسماء الأعمدة تلقائيًا. عدّل المطابقة إذا كانت عناوين ملفك مختلفة.</div><div class="tei-grid">${
      c.fields.map(f=>{
        const aliases=f[2].split(",").map(norm);let idx=headers.findIndex(h=>aliases.includes(norm(h)));
        return `<div class="tei-field"><label>${esc(f[1])}</label><select data-map="${esc(f[0])}"><option value="-1">— غير محدد —</option>${headers.map((h,i)=>`<option value="${i}" ${i===idx?"selected":""}>${esc(h||`عمود ${i+1}`)}</option>`).join("")}</select></div>`;
      }).join("")
    }</div>`;
    box.querySelectorAll("select[data-map]").forEach(x=>x.onchange=()=>validateAndPreview());
  }
  function mappedRows(){
    const c=CATS[document.getElementById("teiCat")?.value||selectedCat];
    const mapping={};
    document.querySelectorAll("#teiMapping select[data-map]").forEach(x=>{if(+x.value>=0)mapping[x.dataset.map]=+x.value;});
    return rows.map(r=>{
      const o={_sourceRow:r._sourceRow};
      Object.entries(mapping).forEach(([k,i])=>o[k]=r._raw[i]);
      return o;
    });
  }
  function validateRow(cat,r){
    const errs=[];
    if(cat==="products"){
      if(!String(r.name||"").trim())errs.push("اسم المنتج مطلوب");
      for(const k of ["buyPrice","sellPrice","stock"]) if(r[k]!==undefined && r[k]!=="" && (!Number.isFinite(num(r[k]))||num(r[k])<0))errs.push("قيمة غير صحيحة: "+k);
      if(r.stock===undefined||r.stock==="")errs.push("الكمية الحالية مطلوبة");
      if(r.expiryDate && !dateValue(r.expiryDate))errs.push("تاريخ الصلاحية غير صحيح");
    } else if(["customers","suppliers"].includes(cat)){if(!String(r.name||"").trim())errs.push("الاسم مطلوب");}
    else if(cat==="banks"){if(!String(r.name||"").trim())errs.push("اسم الحساب مطلوب");if(r.balance!==undefined&&r.balance!==""&&(!Number.isFinite(num(r.balance))||num(r.balance)<0))errs.push("الرصيد غير صحيح");}
    else if(cat==="employees"){if(!String(r.name||"").trim())errs.push("اسم الموظف مطلوب");if(!Number.isFinite(num(r.baseSalary))||num(r.baseSalary)<=0)errs.push("الراتب الأساسي يجب أن يكون أكبر من صفر");}
    else if(["expenses","revenues","salaryPayments"].includes(cat)){if(!String(r.name||"").trim())errs.push("الاسم مطلوب");if(!Number.isFinite(num(r.amount))||num(r.amount)<=0)errs.push("المبلغ يجب أن يكون أكبر من صفر");if(!dateValue(r.date))errs.push("التاريخ مطلوب أو غير صحيح");}
    return errs;
  }
  let validRows=[];
  function validateAndPreview(){
    if(!headers.length){renderPreview();return;}
    const cat=document.getElementById("teiCat").value;
    const mapped=mappedRows();
    validRows=mapped.map(r=>({...r,_errors:validateRow(cat,r)}));
    renderPreview();
    const ok=validRows.filter(r=>!r._errors.length).length, bad=validRows.length-ok;
    setStatus(`الملف: ${lastFile||"—"}\nعدد الصفوف: ${validRows.length} | صالحة: ${ok} | تحتاج تصحيحًا: ${bad}`);
    document.getElementById("teiImport").disabled=ok===0;
  }
  function renderPreview(){
    const box=document.getElementById("teiPreview");if(!box)return;
    if(!rows.length){box.innerHTML="";return;}
    const list=validRows.length?validRows:mappedRows().map(r=>({...r,_errors:validateRow(document.getElementById("teiCat").value,r)}));
    const cols=CATS[document.getElementById("teiCat").value].fields;
    box.innerHTML=`<div style="font-weight:800;margin-top:14px">معاينة أول ${Math.min(list.length,12)} صفًا من ${list.length}</div><div class="tei-tablewrap"><table><thead><tr><th>صف Excel</th>${cols.map(c=>`<th>${esc(c[1])}</th>`).join("")}<th>التحقق</th></tr></thead><tbody>${list.slice(0,12).map(r=>`<tr><td>${r._sourceRow}</td>${cols.map(c=>`<td>${esc(c[0]==="expiryDate"&&r[c[0]]?dateValue(r[c[0]]):(r[c[0]]??"—"))}</td>`).join("")}<td style="color:${r._errors.length?"#b91c1c":"#047857"}">${esc(r._errors.join("؛ ")||"صالح")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function setStatus(t){const el=document.getElementById("teiStatus");if(el)el.textContent=t;}
  function cleanRow(cat,r){
    const n={companyId:app.state.cid,createdAt: r.date?new Date(dateValue(r.date)+"T12:00:00").toISOString():new Date().toISOString(), importedFromExcel:true};
    if(cat==="products") Object.assign(n,{name:String(r.name).trim(),buyPrice:num(r.buyPrice),sellPrice:num(r.sellPrice),stock:num(r.stock),expiryDate:r.expiryDate?dateValue(r.expiryDate):null,sourceType:"opening",...(r.unit?{unit:String(r.unit).trim()}:{}),...(r.category?{category:String(r.category).trim()}:{})});
    if(cat==="customers"||cat==="suppliers") Object.assign(n,{name:String(r.name).trim(),phone:String(r.phone||"").trim(),balance:r.balance!==undefined&&r.balance!==""?num(r.balance):0});
    if(cat==="banks") Object.assign(n,{name:String(r.name).trim(),balance:r.balance!==undefined&&r.balance!==""?num(r.balance):0,accountNumber:String(r.accountNumber||"").trim()});
    if(cat==="employees") Object.assign(n,{name:String(r.name).trim(),phone:String(r.phone||"").trim(),baseSalary:num(r.baseSalary),defaultMethod:["bank","cash"].includes(String(r.defaultMethod||"").toLowerCase())?String(r.defaultMethod).toLowerCase():"cash",payDate:null,lastPaidFor:null,lastPaidAt:null,totalPaid:0});
    if(cat==="expenses") Object.assign(n,{val1:String(r.name).trim(),val2:String(r.note||"").trim(),val3:num(r.amount),method:["bank","cash"].includes(String(r.method||"").toLowerCase())?String(r.method).toLowerCase():"cash",bankId:null,importedHistorical:true});
    if(cat==="revenues") Object.assign(n,{type:"revenue",amount:num(r.amount),cashAmount:0,bankAmount:0,method:["bank","cash"].includes(String(r.method||"").toLowerCase())?String(r.method).toLowerCase():"cash",note:`إيراد تاريخي: ${String(r.name).trim()}${r.note?" - "+String(r.note).trim():""}`,importedHistorical:true});
    if(cat==="salaryPayments") Object.assign(n,{type:"salary_payment",amount:num(r.amount),cashAmount:0,bankAmount:0,method:"cash",note:`راتب تاريخي: ${String(r.name).trim()}${r.note?" - "+String(r.note).trim():""}`,importedHistorical:true});
    return n;
  }
  async function runImport(){
    const cat=document.getElementById("teiCat").value;
    const good=validRows.filter(r=>!r._errors.length);
    if(!good.length)return alert("لا توجد صفوف صالحة للاستيراد.");
    if(!confirm(`سيتم استيراد ${good.length} سجلًا إلى قسم «${CATS[cat].label}». ستستخدم السجلات المستوردة سابقًا المعرّف نفسه لتقليل التكرار. هل تريد المتابعة؟`))return;
    const btn=document.getElementById("teiImport");btn.disabled=true;
    let created=0, skipped=0, failed=0; const errors=[];
    try{
      for(let start=0;start<good.length;start+=150){
        const chunk=good.slice(start,start+150);const batch=db.batch(); let hasWrites=false;
        for(const r of chunk){
          const data=cleanRow(cat,r);
          const id=safeId(cat,{...r,name:r.name||"",date:dateValue(r.date||r.createdAt),amount:r.amount||"",expiryDate:dateValue(r.expiryDate||"")});
          const ref=db.collection(CATS[cat].collection).doc(id);
          try{
            // Deterministic IDs make re-import idempotent: the same source row updates its own imported record instead of creating duplicates.
            batch.set(ref,data);created++;hasWrites=true;
            if(cat==="products"){
              const tr=db.collection("transactions").doc("excel_stock_"+id);
              batch.set(tr,{companyId:app.state.cid,type:"opening_stock",refId:id,amount:0,note:`رصيد مخزون افتتاحي مستورد: ${data.name} (${data.stock})`,createdAt:data.createdAt,importedHistorical:true}); hasWrites=true;
            }
            if(cat==="banks" && num(r.balance)>0){
              const tr=db.collection("transactions").doc("excel_open_"+id);
              batch.set(tr,{companyId:app.state.cid,type:"opening_balance",bankId:id,amount:num(r.balance),bankAmount:num(r.balance),cashAmount:0,method:"bank",note:"رصيد افتتاحي مستورد من Excel",createdAt:data.createdAt,importedHistorical:true}); hasWrites=true;
            }
            if(cat==="expenses"){
              const tr=db.collection("transactions").doc("excel_exp_"+id);
              batch.set(tr,{companyId:app.state.cid,type:"expense",refId:id,amount:num(r.amount),cashAmount:0,bankAmount:0,method:data.method,note:data.val1,createdAt:data.createdAt,importedHistorical:true}); hasWrites=true;
            }
          }catch(e){failed++;errors.push(`صف ${r._sourceRow}: ${e.message}`);}
        }
        if(hasWrites) await batch.commit();
      }
      try{app.clearCache(CATS[cat].collection);app.clearCache("transactions");}catch(_){}
      setStatus(`اكتمل الاستيراد.\nتمت معالجة/حفظ: ${created}\nتمت معالجة السجلات المتطابقة دون إنشاء معرفات جديدة\nأخطاء: ${failed}${errors.length?"\n"+errors.slice(0,8).join("\n"):""}\n\nراجع القسم المعني للتأكد من النتائج.`);
      alert(`اكتمل الاستيراد.\nإضافة: ${created}\nتخطي: ${skipped}\nأخطاء: ${failed}`);
      if(window.app && app.state && app.state.currentView) app.nav(app.state.currentView);
    }catch(e){setStatus("تعذر إكمال الاستيراد: "+e.message);alert("تعذر إكمال الاستيراد: "+e.message);}
    finally{btn.disabled=false;}
  }
  // Public entry point used by the button inside the inventory screen.
  window.TeyssirExcelImport = { open: openModal };

  function start(){
    injectStyle();
    // SheetJS is used only to read user-selected workbooks; all writes go through the existing Firebase client.
    if(!window.XLSX){const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";s.async=true;document.head.appendChild(s);}
    setInterval(addLauncher,1000);
    window.addEventListener("online",()=>{const st=document.getElementById("teiStatus");if(st&&st.textContent.includes("غير متصل"))st.textContent+="\nعاد الاتصال بالإنترنت.";});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();