// --- Codes for access ---
const codes = ["3RHQQ6L19G","YE06QWQDZK","SXWR8AZ400","CVRGWV14RH","PS7331GMVS","ZOZU2T3EQY","0CI9MQ8M60","RL5G5CDE2N","RV36G5V1ZQ","9X36TYPK4U",
// ... باقي الرموز حتى 100
];
function checkCode(){
  const val = document.getElementById('accessCode').value.trim();
  if(!codes.includes(val)){ alert('رمز غير صالح'); return; }
  if(val==="3RHQQ6L19G"){
    const exp = new Date(localStorage.getItem('demoExp') || Date.now());
    if(Date.now() > exp){ alert('انتهت صلاحية الرمز التجريبي'); return; }
    localStorage.setItem('demoExp', new Date(Date.now()+7*24*60*60*1000));
  }
  document.getElementById('loginDiv').style.display='none';
  document.getElementById('app').style.display='block';
  switchLang('ar'); loadState(); updateUICounts();
}

// --- i18n ---
const i18n = {ar:{clients:'الزبائن',suppliers:'الموردين',expense_income:'مصروف - إيراد',banks:'البنوك',products:'المنتجات - المخازن',employees:'الموظفين',reports:'التقارير',invoices:'الفواتير',employeesLabel:'الموظفين',brand:'تطبيق المحاسبة',sub:'نسخة محلية بسيطة',buyFrom:'شراء من مورد',qty:'الكمية',price:'السعر',add:'إضافة',delete:'حذف',confirmDelete:'حذف؟',record:'تسجيل',createInvoice:'إنشاء فاتورة وتنزيل PDF',download:'تنزيل',daily:'تقرير يومي',monthly:'تقرير شهري',register:'تسجيل'},fr:{clients:'Clients',suppliers:'Fournisseurs',expense_income:'Dépense - Revenu',banks:'Banques',products:'Produits - Stock',employees:'Employés',reports:'Rapports',invoices:'Factures',employeesLabel:'Employés',brand:'Application de comptabilité',sub:'Version locale',buyFrom:'Achat chez fournisseur',qty:'Quantité',price:'Prix',add:'Ajouter',delete:'Supprimer',confirmDelete:'Supprimer?',record:'Enregistrer',createInvoice:'Créer facture et télécharger PDF',download:'Télécharger',daily:'Rapport journalier',monthly:'Rapport mensuel',register:'Enregistrer'}};
let currentLang='ar';
function switchLang(lang){currentLang=lang;document.documentElement.lang=(lang==='ar')?'ar':'fr';document.documentElement.dir=(lang==='ar')?'rtl':'ltr';
document.getElementById('brandText').innerText=i18n[lang].brand;
document.getElementById('subText').innerText=i18n[lang].sub;
document.querySelectorAll('[data-key]').forEach(el=>{el.innerText=i18n[lang][el.getAttribute('data-key')]||el.innerText});
document.getElementById('empLabel').innerText=i18n[lang].employeesLabel;}

// --- State ---
const DB_KEY='acc_app_v1'; 
const defaultState={suppliers:[],clients:[],products:[],employees:[],banks:[],invoices:[],transactions:[]};
let state={};
function loadState(){ try{ const raw=localStorage.getItem(DB_KEY); state=raw?JSON.parse(raw):JSON.parse(JSON.stringify(defaultState)); } catch(e){ state=JSON.parse(JSON.stringify(defaultState)); } saveState();}
function saveState(){localStorage.setItem(DB_KEY,JSON.stringify(state));updateUICounts();}
function updateUICounts(){document.getElementById('empCount').innerText=state.employees.length}

// --- Modal ---
function openModal(name){const c=document.getElementById('modalContent'); 
if(name==='suppliers') c.innerHTML = suppliersHTML(); 
else if(name==='products') c.innerHTML = productsHTML(); 
else if(name==='employees') c.innerHTML = employeesHTML(); 
else if(name==='expense_income') c.innerHTML = expenseHTML(); 
else if(name==='invoices') c.innerHTML = invoicesHTML(); 
else if(name==='reports') c.innerHTML = reportsHTML(); 
else if(name==='clients') c.innerHTML = clientsHTML(); 
else if(name==='banks') c.innerHTML = banksHTML(); 
document.getElementById('modalBack').style.display='flex';}
function closeModal(e){document.getElementById('modalBack').style.display='none';}

// باقي الوظائف كاملة مثل app السابق مع add, delete, edit, buy, invoices, reports