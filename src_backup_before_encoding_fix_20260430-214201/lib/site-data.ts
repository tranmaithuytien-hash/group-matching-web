export type FeatureStatus = "available" | "soon";

export type FeatureItem = {
  slug: string;
  icon: string;
  title: string;
  description: string;
  status: FeatureStatus;
  audience: string;
};

export const classroomManagementFeatures: FeatureItem[] = [
  {
    slug: "group-matching",
    icon: "GN",
    title: "Chia nhóm",
    description:
      "Tạo phi�n chia nh�m theo danh s�ch lớp, cấp class code cho sinh vi�n v� điều khiển to�n bộ v�ng chơi.",
    status: "available",
    audience: "Giảng viên & Sinh viên"
  },
  {
    slug: "presentation-topics",
    icon: "CD",
    title: "Lựa chọn chủ đề thuyết trình",
    description:
      "Cho ph�p lớp đăng k� chủ đề, tr�nh tr�ng lặp v� lưu lại lịch sử lựa chọn theo từng lớp học phần.",
    status: "available",
    audience: "Giảng viên & Sinh viên"
  },
  {
    slug: "scoreboard",
    icon: "Đ",
    title: "Bảng điểm",
    description:
      "Quản lý điểm theo từng lớp, lọc dữ liệu nhanh và mở rộng sang dashboard tiến độ học tập sau này.",
    status: "soon",
    audience: "Giảng viên"
  },
  {
    slug: "materials",
    icon: "TL",
    title: "Tài liệu",
    description:
      "Lưu trữ slide, file PDF, b�i đọc v� c�c t�i nguy�n của lớp trong một kh�ng gian truy cập chung.",
    status: "available",
    audience: "Giảng viên & Sinh viên"
  }
];

export const interactiveGameFeatures: FeatureItem[] = [
  {
    slug: "opinion-wall",
    icon: "YK",
    title: "Lắng nghe ý kiến",
    description:
      "Tạo bảng thu ý kiến theo thời gian thực, gần giống Mentimeter, để sinh viên gửi phản hồi nhanh trong lớp.",
    status: "soon",
    audience: "Giảng viên & Sinh viên"
  },
  {
    slug: "timer",
    icon: "TG",
    title: "Timer lớp học",
    description:
      "Đặt nhịp cho hoạt động nhóm, mini game và thảo luận với bộ đếm ngược tối ưu cho cả màn hình lớn lẫn điện thoại.",
    status: "soon",
    audience: "Giảng viên"
  },
  {
    slug: "quiz",
    icon: "QZ",
    title: "Quiz tương t�c",
    description:
      "Tạo c�u hỏi nhanh tr�n lớp, nhận kết quả tức th� v� biến phần kiểm tra miệng th�nh một hoạt động sinh động.",
    status: "soon",
    audience: "Giảng viên & Sinh viên"
  },
  {
    slug: "class-bingo",
    icon: "BG",
    title: "Mini game trên lớp",
    description:
      "Bổ sung thư viện c�c game ngắn như bingo, random challenge hoặc guessing game để khuấy động lớp học.",
    status: "soon",
    audience: "Giảng viên & Sinh viên"
  }
];

export const studentLearningFeatures: FeatureItem[] = [
  {
    slug: "student-review",
    icon: "OT",
    title: "Ôn tập",
    description:
      "Học v� �n tập theo bộ thẻ, c�u hỏi v� bộ đề nhỏ gọn theo kiểu trải nghiệm tương tự Quizlet.",
    status: "soon",
    audience: "Sinh viên"
  },
  {
    slug: "student-submission",
    icon: "NB",
    title: "Nộp bài",
    description:
      "Nộp bài theo từng môn, theo dõi deadline và lịch sử nộp bài ngay trong tài khoản sinh viên.",
    status: "soon",
    audience: "Sinh viên"
  },
  {
    slug: "student-scores",
    icon: "XD",
    title: "Xem bảng điểm",
    description:
      "Xem điểm tổng hợp theo học phần, cập nhật theo đợt và đối chiếu kết quả nhanh ngay trên điện thoại.",
    status: "soon",
    audience: "Sinh viên"
  },
  {
    slug: "student-materials",
    icon: "TL",
    title: "Tài liệu",
    description:
      "Truy cập t�i liệu theo lớp, theo m�n v� lưu nhanh về kh�ng gian học tập c� nh�n.",
    status: "available",
    audience: "Sinh viên"
  }
];

export const primaryFeatures: FeatureItem[] = [
  ...classroomManagementFeatures,
  ...interactiveGameFeatures,
  ...studentLearningFeatures
];

export const footerLinks = {
  product: [
    { href: "/features/group-matching", label: "Chia nhóm" },
    { href: "/features", label: "Tất cả tính năng" },
    { href: "/library", label: "Thư viện game" }
  ],
  support: [
    { href: "/login", label: "Đăng nhập" },
    { href: "/privacy", label: "Ch�nh s�ch bảo mật" },
    { href: "/terms", label: "Điều khoản sử dụng" }
  ]
};
