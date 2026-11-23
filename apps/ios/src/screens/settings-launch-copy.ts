import {tr} from '../i18n';
import {V1_PRIVACY_CHAPTERS,V1_HELP_CHAPTERS,V1_TERMS_CHAPTERS} from './settings-v1-copy';

const account={title:tr('邮箱与 Apple 登录'),paragraphs:[
  tr('个人记录不要求登录。使用家庭功能时，可以选择 Apple 登录或邮箱验证码。登录不会自动上传、备份个人记录或加入家庭。'),
  tr('邮箱验证码用于注册、登录、关联或更换邮箱，以及重新验证身份。验证码有效期为五分钟。请勿将验证码转发给他人。'),
  tr('首次使用邮箱时可设置昵称，保存后不能修改。已有 Apple 账号时，请先用 Apple 登录再关联邮箱；相同邮箱不会自动合并两个账号。'),
]};
const email={title:tr('邮件发送与账号数据'),paragraphs:[
  tr('Lampy 保存你关联的邮箱、验证状态、账号标识和登录会话。验证码只保存加密摘要，不在服务器保存可读验证码。'),
  tr('验证码邮件通过 Resend 发送。收件邮箱和本次验证码会交给邮件服务用于投递；邮件服务也会处理投递所需的技术信息。'),
  tr('正式 Apple 登录不请求姓名或邮箱。Lampy 保存 Apple 提供的账号标识；删除关联账号时，重新验证取得的凭据仅用于验证与撤销授权。'),
]};
const purchases={title:tr('购买与个人导出'),paragraphs:[
  tr('个人生活册可以导出为 EPUB 或 PDF。需要购买的功能会在确认付款前显示 Apple 提供的价格；付款与恢复购买由 App Store 处理。'),
  tr('Lampy 不接收你的银行卡信息。为核验和恢复购买，应用与服务器会处理商品标识、交易标识、签名交易及购买资格。'),
  tr('个人册导出在本机生成；通过系统分享保存后，文件由你选择的应用或位置保管。Lampy 无法远程撤回这些文件。家庭册成品导出暂未开放。'),
]};
const deletion={title:tr('删除账号与 Apple 授权'),paragraphs:[
  tr('在设置的账号页面可以删除账号。纯邮箱账号使用验证码确认；关联过 Apple 的账号需要重新验证 Apple 身份，并尝试撤销 Apple 授权。取消验证不会删除账号。'),
  tr('仍管理有其他成员的家庭时，请先转交或解散。删除会使所有登录会话失效，并清理云端账号及本人分享；本机个人记录和个人册保留。'),
  V1_PRIVACY_CHAPTERS[5].paragraphs[2],
  tr('如 Apple 授权未能自动撤销，页面会提示你在 Apple 账号设置中停止使用 Lampy 登录。删除账号不会自动退款；购买问题请通过 App Store 处理。'),
]};
const albums={title:tr('录音与生活册'),paragraphs:[
  tr('免费使用时，每段新录音最多一分钟；购买相应功能后最多三十分钟。到限会自动停止并保留草稿，已有的较长录音仍可播放。'),
  tr('在「我的生活册」创建个人册、收入记录、调整顺序，再预览或阅读。家庭创建者可以整理家庭册，其他成员可以阅读。'),
  ...V1_HELP_CHAPTERS[2].paragraphs.slice(1),
]};
const storage={title:tr('保管记录与导出文件'),paragraphs:[
  tr('Lampy 不提供个人记录的云备份。卸载应用可能清除本机记录和媒体；导出的文件也请自行妥善保管。'),
  V1_TERMS_CHAPTERS[4].paragraphs[1],
]};
// Preserve family safety and data-retention disclosures; replace the old closed release scope.
export const LAUNCH_PRIVACY_CHAPTERS=[account,email,V1_PRIVACY_CHAPTERS[0],V1_PRIVACY_CHAPTERS[1],V1_PRIVACY_CHAPTERS[2],V1_PRIVACY_CHAPTERS[4],deletion,purchases,storage,V1_PRIVACY_CHAPTERS[7]];
export const LAUNCH_HELP_CHAPTERS=[...V1_HELP_CHAPTERS.slice(0,2),account,albums,purchases,deletion,storage];
export const LAUNCH_TERMS_CHAPTERS=[V1_TERMS_CHAPTERS[0],account,V1_TERMS_CHAPTERS[2],purchases,deletion,storage];
