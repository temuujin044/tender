export type CompanyFormData = {
  entityType: string;
  country: string;
  companyName: string;
  registrationNumber: string;
  isVatPayer: boolean;
  companyStatus: string;
  businessDirections: string[];
  foundedDate: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  parentCompany: string;
  shareholders: string;
  website: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  username: string;
  password: string;
  confirmPassword: string;
};

export type SelectOption = {
  value: string;
  label: string;
};

export const emptyCompanyFormData: CompanyFormData = {
  entityType: '',
  country: '',
  companyName: '',
  registrationNumber: '',
  isVatPayer: false,
  companyStatus: '',
  businessDirections: [],
  foundedDate: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  parentCompany: '',
  shareholders: '',
  website: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  username: '',
  password: '',
  confirmPassword: '',
};

export const entityTypeOptions: SelectOption[] = [
  { value: 'company', label: 'ААН' },
  { value: 'individual', label: 'Хувь хүн' },
  { value: 'foreign', label: 'Гадаад' },
];

const isoCountryCodes = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/);

const mongolianRegionNames = new Intl.DisplayNames(['mn-MN'], { type: 'region' });
const englishRegionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const generatedCountryOptions = isoCountryCodes.map((code) => ({
  value: code.toLowerCase(),
  label: mongolianRegionNames.of(code) || englishRegionNames.of(code) || code,
}));

export const countryOptions: SelectOption[] = [
  ...generatedCountryOptions.filter((option) => option.value === 'mn'),
  ...generatedCountryOptions
    .filter((option) => option.value !== 'mn')
    .sort((left, right) => left.label.localeCompare(right.label, 'mn')),
];

const legacyCountryAliases: Record<string, string> = {
  монгол: 'mn',
  'монгол улс': 'mn',
  бнхау: 'cn',
  хятад: 'cn',
  оху: 'ru',
  орос: 'ru',
  бнсу: 'kr',
  солонгос: 'kr',
  'өмнөд солонгос': 'kr',
  ану: 'us',
  хбнгу: 'de',
};

export function countryValueFromStoredName(value: string) {
  const normalized = value.trim().toLocaleLowerCase('mn');
  if (!normalized) return '';
  if (isoCountryCodes.includes(normalized.toUpperCase())) return normalized;
  if (legacyCountryAliases[normalized]) return legacyCountryAliases[normalized];
  return (
    countryOptions.find((option) => {
      const code = option.value.toUpperCase();
      return (
        option.label.toLocaleLowerCase('mn') === normalized ||
        englishRegionNames.of(code)?.toLowerCase() === normalized
      );
    })?.value ?? ''
  );
}

export const companyStatusOptions: SelectOption[] = [
  { value: 'new', label: 'Шинэ бүртгэл' },
  { value: 'active', label: 'Идэвхтэй' },
  { value: 'suspended', label: 'Түр түдгэлзсэн' },
  { value: 'inactive', label: 'Идэвхгүй' },
  { value: 'closed', label: 'Татан буугдсан' },
];

const emailPattern = /\S+@\S+\.\S+/;

export function validateCompanyFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.entityType) errors.entityType = 'Төрлийг сонгоно уу';
  if (!formData.country) errors.country = 'Улсыг сонгоно уу';
  if (!formData.companyName.trim()) errors.companyName = 'Компанийн нэр шаардлагатай';
  if (!formData.registrationNumber.trim())
    errors.registrationNumber = 'Регистрийн дугаар шаардлагатай';
  if (!formData.businessDirections.length)
    errors.businessDirections = 'Үйл ажиллагааны чиглэл шаардлагатай';
  if (!formData.foundedDate) errors.foundedDate = 'Компанийн байгуулагдсан огноо шаардлагатай';
  if (!formData.companyAddress.trim()) errors.companyAddress = 'Компанийн хаяг шаардлагатай';
  if (!formData.companyPhone.trim()) errors.companyPhone = 'Байгууллагын утас шаардлагатай';
  if (!formData.companyEmail.trim()) errors.companyEmail = 'Байгууллагын и-мэйл хаяг шаардлагатай';
  else if (!emailPattern.test(formData.companyEmail))
    errors.companyEmail = 'Байгууллагын и-мэйл хаяг буруу байна';

  return errors;
}

export function validateContactFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.contactName.trim()) errors.contactName = 'Холбоо барих ажилтны нэр шаардлагатай';
  if (!formData.contactPhone.trim()) errors.contactPhone = 'Холбоо барих ажилтны утас шаардлагатай';
  if (!formData.contactEmail.trim())
    errors.contactEmail = 'Холбоо барих ажилтны и-мэйл хаяг шаардлагатай';
  else if (!emailPattern.test(formData.contactEmail))
    errors.contactEmail = 'Холбоо барих ажилтны и-мэйл хаяг буруу байна';

  return errors;
}

export function validateCredentialFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.username.trim()) errors.username = 'Системд нэвтрэх нэр шаардлагатай';
  if (!formData.password) errors.password = 'Нууц үг шаардлагатай';
  else if (formData.password.length < 8)
    errors.password = 'Нууц үг хамгийн багадаа 8 тэмдэгт байна';

  if (!formData.confirmPassword) errors.confirmPassword = 'Нууц үгээ давтан оруулна уу';
  else if (formData.password !== formData.confirmPassword)
    errors.confirmPassword = 'Нууц үг таарахгүй байна';

  return errors;
}

export function validateAllCompanyFields(formData: CompanyFormData) {
  return {
    ...validateCompanyFields(formData),
    ...validateContactFields(formData),
    ...validateCredentialFields(formData),
  };
}

export function getOptionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? '';
}
