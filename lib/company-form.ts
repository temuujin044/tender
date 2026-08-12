export type CompanyFormData = {
  entityType: string;
  country: string;
  companyName: string;
  registrationNumber: string;
  isVatPayer: boolean;
  companyStatus: string;
  businessDirection: string;
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
  entityType: "",
  country: "",
  companyName: "",
  registrationNumber: "",
  isVatPayer: false,
  companyStatus: "",
  businessDirection: "",
  foundedDate: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  parentCompany: "",
  shareholders: "",
  website: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  username: "",
  password: "",
  confirmPassword: "",
};

export const entityTypeOptions: SelectOption[] = [
  { value: "company", label: "ААН" },
  { value: "individual", label: "Хувь хүн" },
  { value: "foreign", label: "Гадаад" },
];

export const countryOptions: SelectOption[] = [
  { value: "mn", label: "Монгол" },
  { value: "cn", label: "БНХАУ" },
  { value: "ru", label: "ОХУ" },
  { value: "kr", label: "БНСУ" },
  { value: "jp", label: "Япон" },
  { value: "us", label: "АНУ" },
  { value: "de", label: "ХБНГУ" },
  { value: "kz", label: "Казахстан" },
  { value: "sg", label: "Сингапур" },
  { value: "other", label: "Бусад" },
];

export const companyStatusOptions: SelectOption[] = [
  { value: "new", label: "Шинэ бүртгэл" },
  { value: "active", label: "Идэвхтэй" },
  { value: "suspended", label: "Түр түдгэлзсэн" },
  { value: "inactive", label: "Идэвхгүй" },
  { value: "closed", label: "Татан буугдсан" },
];

const emailPattern = /\S+@\S+\.\S+/;

export function validateCompanyFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.entityType) errors.entityType = "Төрлийг сонгоно уу";
  if (!formData.country) errors.country = "Улсыг сонгоно уу";
  if (!formData.companyName.trim())
    errors.companyName = "Компанийн нэр шаардлагатай";
  if (!formData.registrationNumber.trim())
    errors.registrationNumber = "Регистрийн дугаар шаардлагатай";
  if (!formData.businessDirection.trim())
    errors.businessDirection = "Үйл ажиллагааны чиглэл шаардлагатай";
  if (!formData.foundedDate)
    errors.foundedDate = "Компанийн байгуулагдсан огноо шаардлагатай";
  if (!formData.companyAddress.trim())
    errors.companyAddress = "Компанийн хаяг шаардлагатай";
  if (!formData.companyPhone.trim())
    errors.companyPhone = "Байгууллагын утас шаардлагатай";
  if (!formData.companyEmail.trim())
    errors.companyEmail = "Байгууллагын и-мэйл хаяг шаардлагатай";
  else if (!emailPattern.test(formData.companyEmail))
    errors.companyEmail = "Байгууллагын и-мэйл хаяг буруу байна";

  return errors;
}

export function validateContactFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.contactName.trim())
    errors.contactName = "Холбоо барих ажилтны нэр шаардлагатай";
  if (!formData.contactPhone.trim())
    errors.contactPhone = "Холбоо барих ажилтны утас шаардлагатай";
  if (!formData.contactEmail.trim())
    errors.contactEmail = "Холбоо барих ажилтны и-мэйл хаяг шаардлагатай";
  else if (!emailPattern.test(formData.contactEmail))
    errors.contactEmail = "Холбоо барих ажилтны и-мэйл хаяг буруу байна";

  return errors;
}

export function validateCredentialFields(formData: CompanyFormData) {
  const errors: Record<string, string> = {};

  if (!formData.username.trim())
    errors.username = "Системд нэвтрэх нэр шаардлагатай";
  if (!formData.password)
    errors.password = "Нууц үг шаардлагатай";
  else if (formData.password.length < 8)
    errors.password = "Нууц үг хамгийн багадаа 8 тэмдэгт байна";

  if (!formData.confirmPassword)
    errors.confirmPassword = "Нууц үгээ давтан оруулна уу";
  else if (formData.password !== formData.confirmPassword)
    errors.confirmPassword = "Нууц үг таарахгүй байна";

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
  return options.find((option) => option.value === value)?.label ?? "";
}
