/* تسيير ERP — Excel historical data importer
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
      @media(max-width:600px){#teiImportOverlay .tei-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }
  function ensureModal() {
    if(document.getElementById("teiImportOverlay")) return;
    const el=document.createElement("div"); el.id="teiImportOverlay";
    el.innerHTML=`<div class="tei-card" role="dialog" aria-modal="true" aria-label="استيراد Excel">
      <div class="tei-head"><div><h2><i class="fa-solid fa-file-excel"></i> استيراد البيانات السابقة</h2><div style="font-size:12px;opacity:.9;margin-top:4px">تسيير ERP · معاينة وتحقق قبل الحفظ</div></div><button class="tei-close" id="teiImportClose" aria-label="إغلاق">×</button></div>
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
  function openModal(category) {
    if(!window.app || !app.state || !app.state.cid){alert(appText("loginFirst"));return;}
    injectStyle();ensureModal();
    selectedCat=CATS[category] ? category : (document.getElementById("teiCat").value||"products");
    document.getElementById("teiCat").value=selectedCat;
    rows=[];headers=[];validRows=[];lastFile="";
    document.getElementById("teiFile").value="";document.getElementById("teiStatus").textContent="";
    document.getElementById("teiImport").disabled=true;
    applyModalLanguage();
    document.getElementById("teiImportOverlay").style.display="flex"; renderMapping(); renderPreview();
  }
  function applyModalLanguage(){
    const fr=window.app&&app.state&&app.state.lang==="fr";
    const t=fr?{
      aria:"Importer des données Excel",title:"Importer les données historiques",subtitle:"تسيير ERP · aperçu et validation avant enregistrement",note:"Choisissez le type de données puis sélectionnez un classeur Excel XLSX ou XLS. Vérifiez l’aperçu et les erreurs avant l’importation. Les données historiques ne génèrent pas automatiquement de nouveaux encaissements ou paiements.",type:"Type de données",file:"Fichier Excel",template:"Télécharger le modèle Excel",validate:"Vérifier et prévisualiser",import:"Importer les lignes valides",reset:"Réinitialiser",mapping:"Correspondance des colonnes : les noms ont été reconnus automatiquement lorsque possible. Ajustez-les si nécessaire.",
      labels:{products:"Produits et stock",customers:"Clients",suppliers:"Fournisseurs",banks:"Banques et comptes",employees:"Employés et salaires de base",expenses:"Dépenses historiques",revenues:"Revenus historiques",salaryPayments:"Paiements de salaires historiques"}
    }:{
      aria:"استيراد بيانات Excel",title:"استيراد البيانات السابقة",subtitle:"تسيير ERP · معاينة وتحقق قبل الحفظ",note:"اختر نوع البيانات ثم حدد ملف Excel بصيغة XLSX أو XLS. راجع المعاينة والأخطاء قبل الاستيراد. لا تُنشأ عمليات قبض أو دفع جديدة تلقائيًا عند استيراد السجلات التاريخية.",type:"نوع البيانات",file:"ملف Excel",template:"تنزيل قالب Excel",validate:"فحص ومعاينة",import:"استيراد السجلات الصحيحة",reset:"إعادة ضبط",mapping:"مطابقة الأعمدة: تمت محاولة التعرف على أسماء الأعمدة تلقائيًا. عدّل المطابقة إذا لزم الأمر.",
      labels:Object.fromEntries(Object.entries(CATS).map(([k,v])=>[k,v.label]))
    };
    const el=document.querySelector("#teiImportOverlay .tei-card");if(!el)return;
    el.setAttribute("aria-label",t.aria);
    const h=el.querySelector(".tei-head h2");if(h)h.innerHTML='<i class="fa-solid fa-file-excel"></i> '+t.title;
    const sub=el.querySelector(".tei-head h2 + div");if(sub)sub.textContent=t.subtitle;
    const note=el.querySelector(".tei-note");if(note)note.textContent=t.note;
    const l1=el.querySelector('label[for="teiCat"]');if(l1)l1.textContent=t.type;
    const l2=el.querySelector('label[for="teiFile"]');if(l2)l2.textContent=t.file;
    const btns={teiTemplate:t.template,teiValidate:t.validate,teiImport:t.import,teiReset:t.reset};
    Object.entries(btns).forEach(([id,v])=>{const b=document.getElementById(id);if(b)b.textContent=v;});
    const sel=document.getElementById("teiCat");if(sel)Array.from(sel.options).forEach(o=>{if(t.labels[o.value])o.textContent=t.labels[o.value];});
    const mapNote=el.querySelector("#teiMapping .tei-note");if(mapNote)mapNote.textContent=t.mapping;
    el.dir=fr?"ltr":"rtl";
  }
  function closeModal(){const e=document.getElementById("teiImportOverlay");if(e)e.style.display="none";}
  function appText(key){
    const fr={loginFirst:"Connectez-vous d’abord à votre entreprise.",needXlsx:"Le module Excel n’est pas encore chargé. Vérifiez la connexion puis réessayez.",exportEmpty:"Aucune donnée à exporter dans cette section.",exportFail:"L’export Excel a échoué : ",template:"Modèle Excel",import:"Importer Excel",export:"Exporter Excel",validating:"Vérification des données…"};
    const ar={loginFirst:"يرجى تسجيل الدخول إلى الشركة أولًا.",needXlsx:"لم يتم تحميل مكتبة Excel بعد. تحقق من الاتصال ثم أعد المحاولة.",exportEmpty:"لا توجد بيانات في هذا القسم لتصديرها.",exportFail:"تعذر تصدير ملف Excel: ",template:"قالب Excel",import:"استيراد Excel",export:"تصدير Excel",validating:"جارٍ التحقق من البيانات…"};
    return ((window.app&&app.state&&app.state.lang)==="fr"?fr:ar)[key]||key;
  }
  function ensureXLSX(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-tei-xlsx="1"]');
      const script=existing||document.createElement("script");
      if(!existing){script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";script.async=true;script.dataset.teiXlsx="1";document.head.appendChild(script);}
      const timer=setInterval(()=>{if(window.XLSX){clearInterval(timer);resolve(window.XLSX);}},100);
      script.onerror=()=>{clearInterval(timer);reject(new Error(appText("needXlsx")));};
      setTimeout(()=>{if(!window.XLSX){clearInterval(timer);reject(new Error(appText("needXlsx")));}},12000);
    });
  }
  async function downloadTemplate(){
    const cat=document.getElementById("teiCat").value, c=CATS[cat];
    try{
      const X=await ensureXLSX();
      const ws=X.utils.aoa_to_sheet([c.fields.map(f=>fieldLabel(f)), c.fields.map(f=>"")]);
      ws["!cols"]=c.fields.map(f=>({wch:Math.max(18,Math.min(34,fieldLabel(f).length+5))}));
      const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Template");
      const brandName=window.app&&app.state&&app.state.lang==="fr"?"TASSYIR":"تسيير";
      X.writeFile(wb,`${brandName}-${cat}-template.xlsx`);
    }catch(e){alert(e.message||appText("needXlsx"));}
  }
  const EXPORT_FIELDS={
    products:[ ["name","اسم المنتج","Product name"],["buyPrice","سعر الشراء","Purchase price"],["sellPrice","سعر البيع","Selling price"],["stock","الكمية الحالية","Current quantity"],["expiryDate","تاريخ انتهاء الصلاحية","Expiry date"],["unit","وحدة القياس","Unit"],["category","التصنيف","Category"] ],
    customers:[["name","اسم الزبون","Customer name"],["phone","الهاتف","Phone"],["balance","الرصيد","Balance"]],
    suppliers:[["name","اسم المورد","Supplier name"],["phone","الهاتف","Phone"],["balance","الرصيد","Balance"]],
    banks:[["name","اسم البنك أو الحساب","Bank/account name"],["accountNumber","رقم الحساب","Account number"],["balance","الرصيد","Balance"]],
    employees:[["name","اسم الموظف","Employee name"],["phone","الهاتف","Phone"],["baseSalary","الراتب الأساسي","Base salary"],["defaultMethod","طريقة الدفع","Payment method"]],
    expenses:[["date","التاريخ","Date"],["name","اسم المصروف","Expense"],["note","الوصف","Description"],["amount","المبلغ","Amount"],["method","طريقة الدفع","Payment method"],["bankName","اسم البنك","Bank name"]],
    revenues:[["date","التاريخ","Date"],["name","مصدر الإيراد","Revenue source"],["note","الوصف","Description"],["amount","المبلغ","Amount"],["method","طريقة القبض","Receipt method"],["bankName","اسم البنك","Bank name"]],
    salaryPayments:[["date","تاريخ الدفع","Payment date"],["name","اسم الموظف","Employee name"],["amount","المبلغ المدفوع","Paid amount"],["note","ملاحظات","Notes"]]
  };
  function exportRow(cat,d){
    if(cat==="expenses")return {date:dateValue(d.createdAt),name:d.val1||d.name||"",note:d.val2||d.note||"",amount:d.val3??d.amount??0,method:d.method||"",bankName:d.bankName||""};
    if(cat==="revenues")return {date:dateValue(d.createdAt),name:d.name||d.source||d.val1||d.note||"",note:d.note||d.val2||"",amount:d.amount??d.val3??0,method:d.method||"",bankName:d.bankName||""};
    if(cat==="salaryPayments")return {date:dateValue(d.createdAt),name:d.employeeName||d.name||d.note||"",amount:d.amount??0,note:d.note||""};
    return {date:dateValue(d.createdAt),...d};
  }
  async function exportExcel(category){
    if(!window.app||!app.state||!app.state.cid){alert(appText("loginFirst"));return;}
    try{
      const X=await ensureXLSX();let docs=[];
      if(category==="revenues"){
        const [legacy,tx]=await Promise.all([app.getData("revenues"),app.getData("transactions")]);
        docs=[...legacy,...tx.filter(x=>x.type==="revenue"||x.type==="revenues")];
      }
      else if(category==="salaryPayments")docs=(await app.getData("transactions")).filter(x=>x.type==="salary_payment");
      else docs=await app.getData(category==="employees"?"salaries":category);
      if(!Array.isArray(docs)||!docs.length){alert(appText("exportEmpty"));return;}
      const fields=EXPORT_FIELDS[category]||EXPORT_FIELDS.products;
      const isFr=app.state.lang==="fr";
      const rowsOut=[fields.map(f=>isFr?(f[2]||f[1]):f[1]),...docs.map(d=>{const row=exportRow(category,d);return fields.map(f=>row[f[0]]??"");})];
      const ws=X.utils.aoa_to_sheet(rowsOut);ws["!cols"]=fields.map(f=>({wch:Math.max(16,Math.min(32,(isFr?f[2]:f[1]).length+4))}));
      const brandName=isFr?"TASSYIR":"تسيير";
      const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,brandName);
      X.writeFile(wb,`${brandName}-${category}-${new Date().toISOString().slice(0,10)}.xlsx`);
    }catch(e){alert(appText("exportFail")+(e.message||e));}
  }
  function actionButtons(category){
    const isFr=window.app&&app.state&&app.state.lang==="fr";
    const extra=category==="employees"?`<button type="button" class="btn btn-sec" style="width:auto;display:inline-flex;align-items:center;gap:7px;border:1px solid #167b62;color:#11634f;background:#eefaf5;padding:9px 13px" onclick="window.TeyssirExcelImport.open('salaryPayments')"><i class="fa-solid fa-file-import"></i><span>${isFr?"Importer les anciens salaires":"استيراد سجل الرواتب السابق"}</span></button><button type="button" class="btn btn-sec" style="width:auto;display:inline-flex;align-items:center;gap:7px;border:1px solid #245a9b;color:#174a82;background:#eef5ff;padding:9px 13px" onclick="window.TeyssirExcelImport.export('salaryPayments')"><i class="fa-solid fa-file-export"></i><span>${isFr?"Exporter les paiements":"تصدير سجل الرواتب"}</span></button>`:"";
    return `<div class="tei-page-actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin:8px 0 14px;padding:10px 12px;border:1px solid var(--border,#dce3ec);border-radius:12px;background:var(--card,#fff);"><span style="font-size:12px;color:var(--text-light,#64748b);font-weight:700;margin-inline-end:3px">Excel</span><button type="button" class="btn btn-sec" style="width:auto;display:inline-flex;align-items:center;gap:7px;border:1px solid #167b62;color:#11634f;background:#eefaf5;padding:9px 13px" onclick="window.TeyssirExcelImport.open('${category}')"><i class="fa-solid fa-file-import"></i><span data-key="excel_import">${isFr?"Importer Excel":"استيراد Excel"}</span></button><button type="button" class="btn btn-sec" style="width:auto;display:inline-flex;align-items:center;gap:7px;border:1px solid #245a9b;color:#174a82;background:#eef5ff;padding:9px 13px" onclick="window.TeyssirExcelImport.export('${category}')"><i class="fa-solid fa-file-export"></i><span data-key="excel_export">${isFr?"Exporter Excel":"تصدير Excel"}</span></button>${extra}</div>`;
  }
  async function readFile(e){
    const file=e.target.files&&e.target.files[0]; if(!file)return;
    try{await ensureXLSX();}catch(err){setStatus(err.message||appText("needXlsx"));return;}
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
  function fieldLabel(f){
    if(!(window.app&&app.state&&app.state.lang==="fr"))return f[1];
    const labels={name:"Nom / désignation",buyPrice:"Prix d’achat",sellPrice:"Prix de vente",stock:"Quantité actuelle",expiryDate:"Date d’expiration (facultatif)",unit:"Unité (facultatif)",category:"Catégorie (facultatif)",phone:"Téléphone",balance:"Solde antérieur (facultatif)",accountNumber:"Numéro de compte (facultatif)",baseSalary:"Salaire de base",defaultMethod:"Mode de paiement (facultatif)",date:"Date",note:"Description / notes (facultatif)",amount:"Montant",method:"Mode de paiement (facultatif)",bankName:"Nom de la banque (facultatif)"};
    return labels[f[0]]||f[1];
  }
  function renderMapping(){
    const c=CATS[document.getElementById("teiCat")?.value||selectedCat];
    const box=document.getElementById("teiMapping");if(!box)return;
    if(!headers.length){box.innerHTML="";return;}
    box.innerHTML=`<div class="tei-note">${(window.app&&app.state&&app.state.lang==="fr")?"Correspondance des colonnes : les noms ont été reconnus automatiquement lorsque possible. Ajustez-les si nécessaire.":"مطابقة الأعمدة: تمت محاولة التعرف على أسماء الأعمدة تلقائيًا. عدّل المطابقة إذا لزم الأمر."}</div><div class="tei-grid">${
      c.fields.map(f=>{
        const aliases=f[2].split(",").map(norm);let idx=headers.findIndex(h=>aliases.includes(norm(h)));
        return `<div class="tei-field"><label>${esc(fieldLabel(f))}</label><select data-map="${esc(f[0])}"><option value="-1">— غير محدد —</option>${headers.map((h,i)=>`<option value="${i}" ${i===idx?"selected":""}>${esc(h||`عمود ${i+1}`)}</option>`).join("")}</select></div>`;
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
    setStatus((window.app&&app.state&&app.state.lang==="fr"?`Fichier : ${lastFile||"—"}\nLignes : ${validRows.length} | Valides : ${ok} | À corriger : ${bad}`:`الملف: ${lastFile||"—"}\nعدد الصفوف: ${validRows.length} | صالحة: ${ok} | تحتاج تصحيحًا: ${bad}`));
    document.getElementById("teiImport").disabled=ok===0;
  }
  function renderPreview(){
    const box=document.getElementById("teiPreview");if(!box)return;
    if(!rows.length){box.innerHTML="";return;}
    const list=validRows.length?validRows:mappedRows().map(r=>({...r,_errors:validateRow(document.getElementById("teiCat").value,r)}));
    const cols=CATS[document.getElementById("teiCat").value].fields;
    const fr=window.app&&app.state&&app.state.lang==="fr";
    box.innerHTML=`<div style="font-weight:800;margin-top:14px">${fr?`Aperçu des ${Math.min(list.length,12)} premières lignes sur ${list.length}`:`معاينة أول ${Math.min(list.length,12)} صفًا من ${list.length}`}</div><div class="tei-tablewrap"><table><thead><tr><th>${fr?"Ligne Excel":"صف Excel"}</th>${cols.map(c=>`<th>${esc(fieldLabel(c))}</th>`).join("")}<th>${fr?"Validation":"التحقق"}</th></tr></thead><tbody>${list.slice(0,12).map(r=>`<tr><td>${r._sourceRow}</td>${cols.map(c=>`<td>${esc(c[0]==="expiryDate"&&r[c[0]]?dateValue(r[c[0]]):(r[c[0]]??"—"))}</td>`).join("")}<td style="color:${r._errors.length?"#b91c1c":"#047857"}">${esc(r._errors.join("؛ ")||(fr?"Valide":"صالح"))}</td></tr>`).join("")}</tbody></table></div>`;
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
  window.TeyssirExcelImport = { open: openModal, export: exportExcel, buttons: actionButtons };

  function start(){
    injectStyle();
    // Load SheetJS lazily when the user imports, exports, or downloads an XLSX template.
    window.addEventListener("online",()=>{const st=document.getElementById("teiStatus");if(st&&st.textContent.includes("غير متصل"))st.textContent+="\nعاد الاتصال بالإنترنت.";});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();