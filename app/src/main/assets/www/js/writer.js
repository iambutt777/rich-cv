/* =========================================================================
   Offline CV writer. No internet and no API: it builds professional
   sentences from a phrase library for common jobs, personalised with the
   candidate's job title, company, years of experience and skills.
   "Regenerate" picks different phrases each time.

   To add or improve wording, edit the ROLES list below.
   ========================================================================= */
window.CVWriter = (function () {
  const ROLES = [
    {
      id: 'sales', name: 'Sales and retail',
      keys: ['sales', 'sale ', 'retail', 'shop', 'store', 'cashier', 'promoter', 'merchandis', 'showroom', 'business development', 'account executive', 'shop assistant', 'sales assistant', 'store assistant'],
      area: 'sales and customer relationships',
      strengths: ['a strong record of meeting monthly sales targets', 'a friendly, persuasive approach that builds customer trust', 'solid product knowledge and a habit of following up with every lead'],
      duties: [
        'Achieved and regularly exceeded monthly sales targets',
        'Greeted customers, identified their needs and recommended suitable products',
        'Explained product features, prices and promotions clearly to customers',
        'Handled cash, card and mobile payments accurately at the point of sale',
        'Followed up with existing customers to encourage repeat purchases',
        'Kept the sales floor clean, stocked and attractively displayed',
        'Recorded daily sales and reported results to the store manager',
        'Resolved customer complaints politely and quickly',
        'Built a contact list of regular customers through calls and messaging apps',
        'Supported stock counts and checked deliveries against invoices',
        'Promoted special offers that increased average order value',
        'Trained new sales staff on products and customer service standards'
      ],
      skills: ['Customer service', 'Product knowledge', 'Negotiation', 'Cash handling', 'Target achievement', 'Upselling', 'Point of sale (POS) systems', 'Customer follow-up', 'Visual merchandising']
    },
    {
      id: 'service', name: 'Customer service and call centre',
      keys: ['customer service', 'call center', 'call centre', 'customer support', 'telesales', 'receptionist', 'front desk', 'help desk', 'csr', 'chat support'],
      area: 'customer service and communication',
      strengths: ['a calm, patient manner with every customer', 'clear spoken and written communication', 'a record of solving problems on the first contact'],
      duties: [
        'Answered customer calls, emails and chat messages in a friendly, professional way',
        'Resolved customer questions and complaints, escalating complex cases when needed',
        'Recorded every customer interaction accurately in the company system',
        'Met daily targets for calls handled and customer satisfaction',
        'Explained products, services, bookings and payment options to customers',
        'Processed orders, refunds and account changes correctly',
        'Followed up on open cases until the customer issue was fully solved',
        'Shared common customer problems with the team to improve service',
        'Welcomed visitors and directed them to the right department',
        'Managed appointment schedules and confirmed bookings by phone',
        'Kept customer information private and secure'
      ],
      skills: ['Customer service', 'Active listening', 'Problem solving', 'Typing', 'CRM software', 'Complaint handling', 'Phone etiquette', 'Data entry', 'Patience']
    },
    {
      id: 'admin', name: 'Office and administration',
      keys: ['admin', 'office', 'secretary', 'office assistant', 'personal assistant', 'executive assistant', 'clerk', 'data entry', 'document', 'coordinator', 'hr ', 'human resource', 'recruit'],
      area: 'office administration and organisation',
      strengths: ['excellent organisation and attention to detail', 'confident use of Microsoft Office and email', 'reliable handling of confidential documents'],
      duties: [
        'Prepared letters, reports and documents using Microsoft Word and Excel',
        'Entered and updated data in company records with high accuracy',
        'Managed the filing system for paper and digital documents',
        'Scheduled meetings and kept calendars up to date for managers',
        'Answered phone calls and emails and passed messages on promptly',
        'Ordered office supplies and tracked stock levels',
        'Prepared simple expense reports and checked invoices',
        'Supported the recruitment process by arranging interviews and collecting documents',
        'Kept confidential information secure at all times',
        'Welcomed visitors and coordinated with other departments',
        'Translated and explained documents for colleagues when needed'
      ],
      skills: ['Microsoft Word', 'Microsoft Excel', 'Data entry', 'Filing and records', 'Scheduling', 'Email communication', 'Typing', 'Attention to detail', 'Confidentiality']
    },
    {
      id: 'accounts', name: 'Accounting and finance',
      keys: ['account', 'finance', 'bookkeep', 'audit', 'payroll', 'cashier supervisor', 'billing', 'tax'],
      area: 'accounting and financial administration',
      strengths: ['strong accuracy with numbers', 'good knowledge of bookkeeping and Excel', 'a careful approach to deadlines and reporting'],
      duties: [
        'Recorded daily financial transactions accurately in the accounting system',
        'Prepared invoices and followed up on outstanding customer payments',
        'Checked supplier bills and arranged payments on time',
        'Reconciled bank statements and petty cash every month',
        'Prepared monthly reports on income, expenses and balances',
        'Calculated staff salaries, overtime and deductions for payroll',
        'Supported audits by organising receipts and records',
        'Used Excel formulas and accounting software to track figures',
        'Kept financial documents organised and confidential'
      ],
      skills: ['Bookkeeping', 'Microsoft Excel', 'Accounting software', 'Invoicing', 'Bank reconciliation', 'Payroll', 'Financial reporting', 'Accuracy', 'Time management']
    },
    {
      id: 'warehouse', name: 'Warehouse and logistics',
      keys: ['warehouse', 'logistic', 'store keeper', 'storekeeper', 'picker', 'packer', 'forklift', 'inventory', 'stock', 'delivery', 'courier', 'supply chain', 'loader'],
      area: 'warehouse operations and logistics',
      strengths: ['a strong work ethic in fast-paced environments', 'accuracy in picking, packing and stock control', 'a firm commitment to workplace safety'],
      duties: [
        'Received, checked and recorded incoming goods against delivery notes',
        'Picked and packed customer orders quickly and accurately',
        'Loaded and unloaded trucks safely using correct lifting methods',
        'Stored stock in the correct locations and kept the warehouse organised',
        'Carried out regular stock counts and reported any differences',
        'Operated pallet jacks and other handling equipment safely',
        'Labelled and prepared shipments for delivery on schedule',
        'Followed health and safety rules and kept work areas clean',
        'Used handheld scanners and inventory systems to update stock records',
        'Worked in shifts and supported the team during busy periods'
      ],
      skills: ['Picking and packing', 'Inventory control', 'Loading and unloading', 'Barcode scanners', 'Forklift and pallet jack', 'Health and safety', 'Teamwork', 'Physical fitness', 'Time management']
    },
    {
      id: 'factory', name: 'Factory and production',
      keys: ['factory', 'production', 'operator', 'machine', 'assembly', 'manufactur', 'garment', 'sewing', 'textile', 'quality control', 'qc', 'packaging', 'food processing', 'welder', 'welding'],
      area: 'factory production and quality',
      strengths: ['a careful, consistent approach to quality', 'experience operating production machines safely', 'the ability to work long shifts and meet output targets'],
      duties: [
        'Operated production machines safely according to instructions',
        'Assembled products accurately to meet daily output targets',
        'Inspected products for defects and removed items that did not meet standards',
        'Packed finished goods and labelled them correctly',
        'Kept the work station clean and organised using 5S principles',
        'Reported machine problems and safety risks to the supervisor immediately',
        'Recorded production numbers and quality checks on daily sheets',
        'Followed all factory safety rules and wore protective equipment',
        'Worked day and night shifts as part of a production team',
        'Helped train new workers on machine use and quality standards'
      ],
      skills: ['Machine operation', 'Quality inspection', 'Assembly', 'Packaging', '5S workplace organisation', 'Health and safety', 'Teamwork', 'Shift work', 'Attention to detail']
    },
    {
      id: 'driver', name: 'Driver',
      keys: ['driver', 'driving', 'chauffeur', 'truck', 'lorry', 'bus ', 'taxi', 'van '],
      area: 'safe driving and transport',
      strengths: ['a clean and safe driving record', 'good knowledge of routes and traffic rules', 'punctual, reliable service'],
      duties: [
        'Drove company vehicles safely and followed all traffic laws',
        'Delivered goods and passengers to the right destination on time',
        'Planned efficient routes to save time and fuel',
        'Carried out daily vehicle checks for tyres, oil, lights and brakes',
        'Kept the vehicle clean inside and outside',
        'Loaded and secured goods safely before each trip',
        'Recorded trips, mileage and fuel use in the logbook',
        'Collected delivery signatures and payments when required',
        'Reported accidents, damage or vehicle problems immediately',
        'Treated passengers and customers in a polite and professional way'
      ],
      skills: ['Safe driving', 'Route planning', 'Vehicle inspection', 'Traffic rules', 'Time management', 'Customer service', 'Loading and securing goods', 'Logbook records', 'Punctuality']
    },
    {
      id: 'hotel', name: 'Hotel and hospitality',
      keys: ['hotel', 'hospitality', 'front office', 'bellboy', 'bell boy', 'concierge', 'guest', 'resort', 'room attendant', 'housekeep'],
      area: 'hotel service and guest care',
      strengths: ['a warm and welcoming attitude toward guests', 'high standards of cleanliness and presentation', 'the ability to stay calm and helpful during busy periods'],
      duties: [
        'Welcomed guests warmly and helped them with check-in and check-out',
        'Cleaned and prepared guest rooms to hotel standards',
        'Changed bed linen and towels and restocked room supplies',
        'Responded to guest requests quickly and politely',
        'Reported maintenance problems and lost property to the supervisor',
        'Kept public areas, corridors and lobbies clean and tidy',
        'Followed hotel safety, hygiene and security procedures',
        'Worked closely with front office, housekeeping and maintenance teams',
        'Gave guests information about hotel services and local attractions',
        'Handled guest complaints professionally to keep satisfaction high'
      ],
      skills: ['Guest service', 'Room cleaning', 'Housekeeping standards', 'Communication', 'Teamwork', 'Hygiene and safety', 'Time management', 'Problem solving', 'Positive attitude']
    },
    {
      id: 'restaurant', name: 'Restaurant, cook and kitchen',
      keys: ['cook', 'chef', 'kitchen', 'restaurant', 'waiter', 'waitress', 'server', 'barista', 'bartender', 'food', 'baker', 'dishwasher', 'steward', 'catering', 'cafe'],
      area: 'food preparation and restaurant service',
      strengths: ['a strong focus on food hygiene and safety', 'speed and accuracy during busy service hours', 'friendly, attentive customer service'],
      duties: [
        'Prepared ingredients and cooked dishes following recipes and portion sizes',
        'Kept the kitchen, equipment and storage areas clean and hygienic',
        'Followed food safety rules for storage, temperature and labelling',
        'Took customer orders accurately and served food and drinks promptly',
        'Set up and cleared tables and kept the dining area tidy',
        'Checked deliveries and rotated stock to reduce waste',
        'Worked quickly as part of the team during busy lunch and dinner service',
        'Washed dishes and kitchen tools and kept them organised',
        'Prepared coffee and drinks to a consistent standard',
        'Handled customer requests and special diet needs politely'
      ],
      skills: ['Food preparation', 'Cooking', 'Food hygiene and safety', 'Customer service', 'Order taking', 'Kitchen cleaning', 'Stock rotation', 'Teamwork', 'Working under pressure']
    },
    {
      id: 'cleaning', name: 'Cleaning and domestic work',
      keys: ['clean', 'janitor', 'domestic', 'maid', 'helper', 'housemaid', 'nanny', 'babysit', 'laundry', 'house keeper'],
      area: 'cleaning and household support',
      strengths: ['high standards of cleanliness', 'honesty and trustworthiness in private homes', 'a hardworking, careful and reliable attitude'],
      duties: [
        'Cleaned rooms, kitchens, bathrooms and floors to a high standard',
        'Washed, dried and ironed clothes and household linen',
        'Used cleaning chemicals and equipment safely and correctly',
        'Kept the home or workplace tidy, organised and hygienic',
        'Prepared simple meals and helped with grocery shopping',
        'Took care of children, including meals, bathing and school routines',
        'Followed the family or supervisor\'s instructions carefully',
        'Reported damage, maintenance needs or supplies running low',
        'Respected privacy and kept household matters confidential'
      ],
      skills: ['House cleaning', 'Laundry and ironing', 'Childcare', 'Basic cooking', 'Safe use of cleaning products', 'Honesty', 'Time management', 'Attention to detail', 'Trustworthiness']
    },
    {
      id: 'care', name: 'Caregiver and healthcare support',
      keys: ['caregiver', 'care giver', 'carer', 'elderly', 'nurse', 'nursing', 'patient', 'health', 'hospital', 'clinic', 'aide'],
      area: 'patient care and healthcare support',
      strengths: ['a kind and patient approach to every patient', 'experience supporting elderly people with daily needs', 'careful attention to health, hygiene and safety'],
      duties: [
        'Helped elderly people and patients with bathing, dressing and eating',
        'Gave medicine on time as instructed by nurses or family members',
        'Monitored temperature, blood pressure and general condition and reported changes',
        'Helped patients move safely and prevented falls',
        'Prepared healthy meals that followed special diet needs',
        'Kept rooms, bedding and medical equipment clean and hygienic',
        'Provided friendly companionship and emotional support',
        'Recorded daily care activities in the care notes',
        'Followed infection control and safety procedures'
      ],
      skills: ['Elderly care', 'Personal care', 'Patient handling', 'Medication support', 'Vital signs monitoring', 'Hygiene and infection control', 'First aid', 'Compassion', 'Patience']
    },
    {
      id: 'construction', name: 'Construction and technical work',
      keys: ['construct', 'mason', 'carpenter', 'electrician', 'plumber', 'technician', 'mechanic', 'painter', 'builder', 'labour', 'labor', 'scaffold', 'fitter', 'maintenance', 'engineer', 'air con', 'hvac'],
      area: 'construction and technical maintenance',
      strengths: ['practical skills with tools and equipment', 'a strict focus on site safety', 'the ability to read drawings and follow instructions accurately'],
      duties: [
        'Carried out construction and repair work following drawings and instructions',
        'Used hand and power tools safely and kept them in good condition',
        'Installed, tested and repaired electrical, plumbing or mechanical systems',
        'Prepared work areas and moved materials safely around the site',
        'Measured, cut and fitted materials accurately',
        'Followed site safety rules and wore protective equipment at all times',
        'Carried out routine maintenance to prevent breakdowns',
        'Identified faults and reported problems to the supervisor',
        'Worked with other trades to finish projects on schedule',
        'Kept the work site clean and tidy at the end of each shift'
      ],
      skills: ['Hand and power tools', 'Reading drawings', 'Site safety', 'Repair and maintenance', 'Measuring and cutting', 'Installation', 'Teamwork', 'Problem solving', 'Physical fitness']
    },
    {
      id: 'security', name: 'Security',
      keys: ['security', 'guard', 'watchman', 'patrol', 'cctv'],
      area: 'security and safety',
      strengths: ['strong observation skills', 'a disciplined and responsible attitude', 'calm judgement in emergencies'],
      duties: [
        'Patrolled buildings and grounds to prevent theft, damage and trespass',
        'Checked the identity of visitors and recorded entries and exits',
        'Monitored CCTV cameras and alarm systems',
        'Responded quickly and calmly to incidents and emergencies',
        'Wrote clear reports on incidents and daily activities',
        'Controlled access to restricted areas',
        'Helped staff and visitors with directions and information',
        'Carried out fire safety checks and supported evacuations'
      ],
      skills: ['Patrolling', 'CCTV monitoring', 'Access control', 'Incident reporting', 'Emergency response', 'Observation', 'Discipline', 'First aid', 'Communication']
    },
    {
      id: 'it', name: 'IT and computer',
      keys: ['it ', 'i.t', 'computer', 'software', 'developer', 'programmer', 'web', 'network', 'technical support', 'system admin', 'graphic', 'designer', 'data analyst'],
      area: 'information technology and digital work',
      strengths: ['strong problem-solving skills', 'confidence with computers, software and new technology', 'clear communication with non-technical colleagues'],
      duties: [
        'Set up and maintained computers, printers and office networks',
        'Solved hardware and software problems for staff quickly',
        'Installed and updated software and kept systems secure',
        'Created and updated websites, social media graphics and digital content',
        'Backed up important data and helped recover lost files',
        'Trained staff to use new software and systems',
        'Kept records of equipment, licences and support requests',
        'Worked with suppliers to fix complex technical issues'
      ],
      skills: ['Computer hardware', 'Troubleshooting', 'Microsoft Office', 'Networking basics', 'Graphic design', 'Social media', 'Data backup', 'Technical support', 'Problem solving']
    },
    {
      id: 'beauty', name: 'Beauty, spa and salon',
      keys: ['beauty', 'spa', 'salon', 'massage', 'therapist', 'nail', 'hair', 'makeup', 'make-up', 'barber', 'beautician'],
      area: 'beauty, wellness and spa services',
      strengths: ['skilled, gentle hands and attention to detail', 'a calm and welcoming manner with clients', 'high standards of hygiene'],
      duties: [
        'Provided massage, facial, nail and hair treatments to clients',
        'Consulted clients to understand their needs and recommend treatments',
        'Kept treatment rooms and tools clean and sterilised',
        'Recommended and sold beauty products to clients',
        'Booked appointments and managed the daily schedule',
        'Followed hygiene and safety standards for every treatment',
        'Built a group of regular, loyal clients through excellent service'
      ],
      skills: ['Massage therapy', 'Facial treatments', 'Nail care', 'Hair styling', 'Client consultation', 'Hygiene standards', 'Customer service', 'Product sales', 'Appointment scheduling']
    },
    {
      id: 'marketing', name: 'Marketing and social media',
      keys: ['marketing', 'social media', 'content', 'digital', 'advertis', 'brand', 'public relation', 'event'],
      area: 'marketing and social media',
      strengths: ['creative ideas that attract attention', 'practical knowledge of Facebook, TikTok and other platforms', 'a focus on measurable results'],
      duties: [
        'Created posts, photos and short videos for Facebook, TikTok and Instagram',
        'Planned a monthly content calendar and posted on schedule',
        'Replied to comments and messages to build an active community',
        'Ran and monitored paid advertising campaigns',
        'Tracked page reach, engagement and leads and reported results',
        'Organised promotional events and product launches',
        'Wrote clear marketing text for posters, flyers and websites'
      ],
      skills: ['Social media marketing', 'Content creation', 'Video editing', 'Copywriting', 'Facebook and TikTok ads', 'Canva', 'Event planning', 'Analytics', 'Creativity']
    },
    {
      id: 'teacher', name: 'Teaching and education',
      keys: ['teacher', 'tutor', 'teaching', 'trainer', 'instructor', 'lecturer', 'education'],
      area: 'teaching and training',
      strengths: ['clear explanations that make learning easy', 'patience and encouragement with every learner', 'well-organised lesson planning'],
      duties: [
        'Planned and delivered lessons that matched learners\' levels',
        'Explained topics clearly using examples and activities',
        'Checked homework and tests and gave helpful feedback',
        'Tracked student progress and reported to parents or managers',
        'Kept the classroom positive, safe and well organised',
        'Prepared teaching materials and worksheets',
        'Supported students who needed extra help'
      ],
      skills: ['Lesson planning', 'Classroom management', 'Clear communication', 'Student assessment', 'Patience', 'Presentation skills', 'Microsoft Office', 'Motivation', 'Organisation']
    },
    {
      id: 'agri', name: 'Agriculture and farm work',
      keys: ['farm', 'agricultur', 'plantation', 'harvest', 'garden', 'livestock', 'fishery', 'fisherman', 'palm oil', 'rubber'],
      area: 'farm and plantation work',
      strengths: ['hard work in outdoor conditions', 'practical knowledge of planting, harvesting and animal care', 'reliability during long working days'],
      duties: [
        'Planted, watered and harvested crops following the farm schedule',
        'Applied fertiliser and plant protection safely and correctly',
        'Fed and cared for animals and kept their areas clean',
        'Operated and maintained basic farm tools and machines',
        'Sorted, packed and stored harvested products',
        'Kept the farm, paths and storage areas clean and safe',
        'Worked well in a team during busy harvest seasons'
      ],
      skills: ['Planting and harvesting', 'Animal care', 'Farm machinery', 'Safe use of fertilisers', 'Physical fitness', 'Teamwork', 'Reliability', 'Outdoor work', 'Packing and sorting']
    }
  ];

  const GENERIC = {
    id: 'general', name: 'General work',
    area: 'customer service, teamwork and daily operations',
    strengths: ['a positive attitude and willingness to learn', 'reliability and good time keeping', 'strong teamwork and communication skills'],
    duties: [
      'Completed daily tasks accurately and on time',
      'Followed company procedures and supervisor instructions carefully',
      'Worked closely with team members to meet targets',
      'Served customers in a polite and helpful way',
      'Kept the work area clean, safe and organised',
      'Learned new tasks quickly and supported colleagues when needed',
      'Reported problems and suggested simple improvements',
      'Recorded work activities and reported progress to the supervisor'
    ],
    skills: ['Teamwork', 'Communication', 'Time management', 'Customer service', 'Problem solving', 'Reliability', 'Adaptability', 'Microsoft Office', 'Willingness to learn']
  };

  /* ---------- ready-made job titles, grouped by job type (for the job title list) ---------- */
  const TITLES = {
    sales: ['Sales Representative', 'Sales Executive', 'Sales Assistant', 'Shop Assistant', 'Cashier', 'Retail Sales Associate', 'Store Supervisor', 'Store Manager', 'Promoter', 'Merchandiser', 'Telesales Agent', 'Business Development Executive', 'Key Account Executive', 'Showroom Sales Consultant', 'Mobile Phone Sales Executive', 'Car Sales Consultant', 'Real Estate Agent'],
    service: ['Customer Service Representative', 'Call Centre Agent', 'Customer Support Agent', 'Receptionist', 'Front Desk Officer', 'Chat Support Agent', 'Customer Care Executive', 'Help Desk Assistant', 'Complaints Officer'],
    admin: ['Office Assistant', 'Admin Assistant', 'Administrative Officer', 'Secretary', 'Personal Assistant', 'Data Entry Clerk', 'Document Controller', 'Office Coordinator', 'HR Assistant', 'Recruitment Assistant', 'Translator', 'Interpreter'],
    accounts: ['Accountant', 'Junior Accountant', 'Accounts Assistant', 'Bookkeeper', 'Billing Officer', 'Payroll Officer', 'Finance Assistant', 'Audit Assistant'],
    warehouse: ['Warehouse Worker', 'Warehouse Assistant', 'Storekeeper', 'Picker and Packer', 'Forklift Operator', 'Inventory Clerk', 'Logistics Assistant', 'Loader', 'Delivery Rider', 'Courier', 'Warehouse Supervisor'],
    factory: ['Factory Worker', 'Production Operator', 'Machine Operator', 'Assembly Line Worker', 'Quality Control Inspector', 'Packaging Worker', 'Sewing Machine Operator', 'Garment Worker', 'Food Processing Worker', 'Welder', 'Production Supervisor'],
    driver: ['Driver', 'Delivery Driver', 'Truck Driver', 'Bus Driver', 'Taxi Driver', 'Company Driver', 'Personal Driver', 'Van Driver', 'Heavy Vehicle Driver'],
    hotel: ['Hotel Room Attendant', 'Housekeeping Attendant', 'Front Office Agent', 'Guest Service Agent', 'Bellboy', 'Concierge', 'Laundry Attendant', 'Hotel Receptionist', 'Resort Staff'],
    restaurant: ['Waiter', 'Waitress', 'Cook', 'Commis Chef', 'Chef', 'Kitchen Helper', 'Kitchen Steward', 'Barista', 'Bartender', 'Baker', 'Dishwasher', 'Restaurant Supervisor', 'Food and Beverage Attendant', 'Catering Assistant'],
    cleaning: ['Cleaner', 'Housekeeper', 'Domestic Helper', 'Housemaid', 'Nanny', 'Babysitter', 'Janitor', 'Office Cleaner', 'Laundry Worker'],
    care: ['Caregiver', 'Elderly Caregiver', 'Nursing Assistant', 'Patient Care Assistant', 'Home Care Aide', 'Nurse', 'Hospital Attendant', 'Clinic Assistant'],
    construction: ['Construction Worker', 'General Labourer', 'Mason', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Technician', 'Air Conditioning Technician', 'Maintenance Technician', 'Mechanic', 'Steel Fixer', 'Scaffolder', 'Site Supervisor'],
    security: ['Security Guard', 'Security Officer', 'Watchman', 'CCTV Operator', 'Security Supervisor'],
    it: ['IT Support', 'IT Technician', 'Computer Operator', 'Web Developer', 'Software Developer', 'Network Technician', 'Graphic Designer', 'Data Analyst', 'System Administrator'],
    beauty: ['Spa Therapist', 'Massage Therapist', 'Beautician', 'Hair Stylist', 'Barber', 'Nail Technician', 'Makeup Artist', 'Salon Assistant'],
    marketing: ['Social Media Marketer', 'Marketing Assistant', 'Content Creator', 'Digital Marketing Executive', 'Event Coordinator', 'Brand Promoter', 'Video Editor'],
    teacher: ['English Teacher', 'Teacher', 'Teaching Assistant', 'Tutor', 'Trainer', 'Kindergarten Teacher'],
    agri: ['Farm Worker', 'Plantation Worker', 'Agricultural Worker', 'Gardener', 'Livestock Worker', 'Fisherman', 'Fruit Picker']
  };
  function titleGroups() { return ROLES.map(r => ({ name: r.name, titles: TITLES[r.id] || [] })).filter(g => g.titles.length); }
  // titles matching what the user typed: starts first, then word starts, then anywhere
  function matchTitles(q, max) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    const all = [];
    Object.keys(TITLES).forEach(k => TITLES[k].forEach(t => { if (all.indexOf(t) < 0) all.push(t); }));
    const starts = [], words = [], inside = [];
    all.forEach(t => {
      const l = t.toLowerCase();
      if (l === q) return;
      if (l.startsWith(q)) starts.push(t);
      else if (l.split(/\s+/).some(w => w.startsWith(q))) words.push(t);
      else if (q.length >= 3 && l.includes(q)) inside.push(t);
    });
    return starts.concat(words, inside).slice(0, max || 8);
  }

  /* ---------- helpers ---------- */
  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9.\s-]/g, ' ').replace(/\s+/g, ' ') + ' '; }
  function detect(text) {
    const t = norm(text);
    let best = null, score = 0;
    ROLES.forEach(r => {
      let sc = 0;
      r.keys.forEach(k => { if (t.indexOf(k.indexOf(' ') === k.length - 1 ? ' ' + k : k) >= 0) sc += k.length; });
      if (sc > score) { score = sc; best = r; }
    });
    return best || GENERIC;
  }
  // small seeded random so "Regenerate" changes wording but stays stable while typing
  function rng(seed) {
    let x = (seed >>> 0) || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
  }
  function shuffle(arr, seed) {
    const a = arr.slice(), r = rng(seed);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const pick = (arr, seed) => arr[Math.floor(rng(seed)() * arr.length)];

  function monthsBetween(start, end) {
    // a year without a month ("Not shown"): from January / to December of that year
    const p = (s, last) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(s || ''); return m ? +m[1] * 12 + (m[2] ? +m[2] - 1 : last ? 11 : 0) : null; };
    const a = p(start);
    const now = new Date();
    const b = end ? Math.min(p(end, true), now.getFullYear() * 12 + now.getMonth()) : now.getFullYear() * 12 + now.getMonth();
    if (a == null || b == null || b < a) return 0;
    return b - a + 1;
  }
  function totalMonths(experience) {
    return (experience || []).reduce((sum, e) => sum + monthsBetween(e.start, e.current ? '' : e.end), 0);
  }
  function yearsText(months) {
    if (months < 12) return months >= 6 ? 'nearly one year' : '';
    const y = Math.floor(months / 12);
    return (months % 12 >= 6 ? 'over ' : '') + (y === 1 ? 'one year' : y + ' years');
  }
  function listText(items) {
    items = items.filter(Boolean);
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  // lower-case a skill for use inside a sentence, but keep names like "Microsoft Excel", "CRM", "Canva"
  const PROPER = /^(microsoft|excel|word|facebook|tiktok|instagram|canva|english|thai|burmese|myanmar|chinese|malay|arabic|hindi|japanese|korean)\b/i;
  function lc(s) {
    s = String(s || '').trim();
    const words = s.split(/\s+/);
    if (PROPER.test(s) || /^[A-Z0-9()]{2,}$/.test(words[0])) return s;
    if (words.length > 1 && words.every(w => /^[A-Z(]/.test(w))) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  const article = s => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;

  /* ---------- public: profile summary ---------- */
  function summary(cv, seed) {
    seed = seed || 1;
    const title = (cv.title || (cv.experience && cv.experience[0] && cv.experience[0].title) || '').trim();
    const role = detect(title + ' ' + (cv.experience || []).map(e => e.title).join(' '));
    const months = totalMonths(cv.experience);
    const yrs = yearsText(months);
    const skills = (cv.skills || []).slice(0, 3).map(lc);
    const langs = (cv.languages || []).filter(l => l.name).map(l => l.name);
    const r = rng(seed);
    const t = title || 'professional';

    const openers = yrs ? [
      'Hardworking ' + t + ' with ' + yrs + ' of experience in ' + role.area + '.',
      'Reliable and motivated ' + t + ' with ' + yrs + ' of hands-on experience in ' + role.area + '.',
      'Dedicated ' + t + ' bringing ' + yrs + ' of practical experience in ' + role.area + '.'
    ] : [
      'Motivated and hardworking candidate seeking a position as ' + article(t) + '.',
      'Enthusiastic ' + t + ' with a strong interest in ' + role.area + ' and a fast-learning attitude.',
      'Reliable and positive candidate ready to start a career as ' + article(t) + '.'
    ];
    const st = shuffle(role.strengths, seed + 7);
    const strength = 'Known for ' + st[0] + ', along with ' + st[1] + '.';
    const skillLine = skills.length ? 'Skilled in ' + listText(skills) + '.' : '';
    const langLine = langs.length >= 2 ? 'Able to communicate in ' + listText(langs.slice(0, 3)) + '.' : (langs.length === 1 ? 'Communicates confidently in ' + langs[0] + '.' : '');
    const goals = [
      'Looking for an opportunity to contribute to a professional team and grow with the company.',
      'Ready to work hard, learn quickly and add value from the first day.',
      'Seeking a long-term role where dedication and teamwork are valued.',
      'Committed to safety, quality and excellent service in every task.'
    ];
    return [pick(openers, seed), strength, skillLine, langLine, goals[Math.floor(r() * goals.length)]].filter(Boolean).join(' ');
  }

  /* ---------- public: job duties for one experience entry ---------- */
  // exclude = lines already used in the candidate's other jobs, so no bullet appears twice on the CV
  function duties(entry, seed, count, exclude) {
    count = count || 5;
    const role = detect(entry.title + ' ' + (entry.company || ''));
    const used = new Set((exclude || []).map(x => String(x).trim().toLowerCase()));
    let list = shuffle(role.duties.filter(d => !used.has(d.toLowerCase())), (seed || 1) * 31 + 3);
    if (list.length < count) list = list.concat(shuffle(GENERIC.duties.filter(d => !used.has(d.toLowerCase())), seed || 1));
    // put a target/achievement line first when there is one: reads stronger
    const strong = list.findIndex(d => /^(achieved|met |exceeded)/i.test(d));
    if (strong > 0) list.unshift(list.splice(strong, 1)[0]);
    return list.slice(0, count).join('\n');
  }

  /* ---------- public: skills ---------- */
  function suggestSkills(cv) {
    const text = (cv.title || '') + ' ' + (cv.experience || []).map(e => e.title).join(' ');
    const roles = [detect(text)];
    (cv.experience || []).forEach(e => { const r = detect(e.title); if (roles.indexOf(r) < 0) roles.push(r); });
    const have = new Set((cv.skills || []).map(s => s.toLowerCase()));
    const out = [];
    roles.forEach(r => r.skills.forEach(s => { if (!have.has(s.toLowerCase()) && out.indexOf(s) < 0) out.push(s); }));
    return out.slice(0, 10);
  }

  /* ---------- public: tidy text the user typed ---------- */
  function polishLines(text) {
    return String(text || '').split(/\n+/).map(l => l.replace(/^[\s•\-*·\u2022\d.)]+/, '').trim())
      .filter(Boolean)
      .map(l => l.charAt(0).toUpperCase() + l.slice(1))
      .map(l => l.replace(/[.;,]+$/, ''))
      .join('\n');
  }
  function polishParagraph(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return t;
    t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    t = t.replace(/\bi\b/g, 'I');
    if (!/[.!?]$/.test(t)) t += '.';
    return t;
  }

  return {
    roles: ROLES.map(r => ({ id: r.id, name: r.name })), titleGroups, matchTitles,
    detect: t => { const r = detect(t); return { id: r.id, name: r.name }; },
    summary, duties, suggestSkills, polishLines, polishParagraph, totalMonths, monthsBetween
  };
})();
