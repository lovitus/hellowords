/** Original bilingual practice, separate from grounded object-word counts. */
export interface SceneConversation {
  readonly title: string;
  readonly roles: readonly [string, string];
  readonly lines: readonly (readonly [string, string])[];
}

export const SCENE_CONVERSATIONS: Readonly<Record<string, readonly SceneConversation[]>> = {
  "school-dining-hall": [
    { title: "选餐与份量", roles: ["学生", "供餐员"], lines: [
      ["Could I have rice with vegetables, please?", "请给我米饭配蔬菜。"],
      ["Would you like a small portion or a regular portion?", "你要小份还是普通份？"],
      ["A small portion, and some soup on the side.", "小份，再单独来些汤。"],
      ["Take a bowl from the shelf beside the trays.", "从托盘旁的架子上拿一个碗。"],
      ["Is drinking water included?", "包含饮用水吗？"],
      ["Yes. The water dispenser is beside the cups.", "包含，饮水机就在杯子旁边。"],
    ] },
    { title: "找座位与收餐盘", roles: ["新同学", "同学"], lines: [
      ["Is this seat taken?", "这个座位有人吗？"],
      ["No, you can put your tray here.", "没有，你可以把托盘放这里。"],
      ["Where do we take our plates afterwards?", "吃完后盘子放到哪里？"],
      ["Put them on the return counter near the exit.", "放在出口附近的回收台上。"],
      ["Do we separate the food scraps?", "剩饭需要分开倒吗？"],
      ["Yes, empty them into the food-waste bin first.", "需要，先倒进厨余垃圾桶。"],
    ] },
  ],
  "city-cafe": [
    { title: "点咖啡与打包", roles: ["顾客", "店员"], lines: [
      ["I'd like a medium latte with oat milk.", "我想要一杯中杯燕麦奶拿铁。"],
      ["Would you like it hot or iced?", "你要热的还是冰的？"],
      ["Iced, with less ice, please.", "冰的，请少放冰。"],
      ["Will that be for here or to go?", "在这里喝还是带走？"],
      ["To go. Could I have a lid, please?", "带走，请给我一个杯盖。"],
      ["Of course. Please collect your drink at the counter.", "当然，请在柜台取饮品。"],
    ] },
    { title: "确认订单与付款", roles: ["顾客", "店员"], lines: [
      ["I ordered a decaf coffee. Is this mine?", "我点了低因咖啡，这是我的吗？"],
      ["Let me check your order number.", "让我核对一下你的订单号。"],
      ["It's twenty-three. I also ordered a sandwich.", "是二十三号，我还点了一份三明治。"],
      ["Your sandwich is ready. Would you like it heated?", "三明治好了，需要加热吗？"],
      ["Yes, please. Can I pay by card?", "需要，谢谢。我可以刷卡吗？"],
      ["Yes. Tap your card here and take your receipt.", "可以，在这里感应卡片，然后拿好收据。"],
    ] },
  ],
  airport: [
    { title: "办理值机", roles: ["旅客", "值机员"], lines: [
      ["I'd like to check in for my flight to London.", "我想办理飞往伦敦的航班值机。"],
      ["May I see your passport and booking reference?", "请出示护照和预订编号。"],
      ["Here they are. Could I have an aisle seat?", "给您。我可以选靠过道的座位吗？"],
      ["Yes. How many bags are you checking in?", "可以。您要托运几件行李？"],
      ["One suitcase. This backpack is my carry-on.", "一个行李箱。这个背包是随身行李。"],
      ["Please place the suitcase on the scale.", "请把行李箱放到秤上。"],
    ] },
    { title: "确认登机口", roles: ["旅客", "工作人员"], lines: [
      ["Has the gate for flight AB twenty changed?", "AB二十次航班的登机口变了吗？"],
      ["Yes, it is now gate twelve in terminal two.", "变了，现在是二号航站楼十二号登机口。"],
      ["How do I get there from here?", "从这里怎么过去？"],
      ["Follow the signs and take the shuttle downstairs.", "沿着指示牌走，到楼下乘接驳车。"],
      ["Has boarding started yet?", "已经开始登机了吗？"],
      ["Not yet. Check the departure screen for updates.", "还没有，请看出发信息屏上的更新。"],
    ] },
  ],
  hospital: [
    { title: "挂号与问路", roles: ["来访者", "接待员"], lines: [
      ["I have an appointment at ten thirty.", "我预约了十点半。"],
      ["What is your name, please?", "请问您叫什么名字？"],
      ["Alex Chen. Where should I check in?", "陈Alex。我应该在哪里登记？"],
      ["Please check in at the reception desk on this floor.", "请在本层的接待台登记。"],
      ["Is there a lift to the outpatient clinic?", "有电梯可以到门诊吗？"],
      ["Yes, the lifts are past the waiting area.", "有，穿过候诊区就是电梯。"],
    ] },
    { title: "说明情况与沟通需求", roles: ["患者", "工作人员"], lines: [
      ["I'd like to describe my symptoms to the doctor.", "我想向医生说明我的症状。"],
      ["Please tell the doctor when they started.", "请告诉医生症状是什么时候开始的。"],
      ["Could I have an interpreter for the appointment?", "就诊时可以安排口译员吗？"],
      ["Which language would you prefer?", "您希望使用哪种语言？"],
      ["Mandarin, please. Could you write the instructions down?", "普通话，谢谢。您能把说明写下来吗？"],
      ["I will ask the clinical team to help you.", "我会请医护团队帮助您。"],
    ] },
  ],
  "hospital-pharmacy": [
    { title: "领取处方药", roles: ["患者", "药师"], lines: [
      ["I'm here to collect my prescription.", "我来领取处方药。"],
      ["Please confirm your name and date of birth.", "请确认您的姓名和出生日期。"],
      ["Could you explain the label to me?", "您能为我解释药品标签吗？"],
      ["Let's go through the instructions together.", "我们一起逐条看一下说明。"],
      ["Could you write down how I should store it?", "您能写下应该如何保存吗？"],
      ["Yes. Please ask if any part is unclear.", "可以，有不清楚的地方请问我。"],
    ] },
    { title: "向药师确认用药疑问", roles: ["患者", "药师"], lines: [
      ["I take another medicine. Can you check for interactions?", "我还在用另一种药，您能检查是否有相互作用吗？"],
      ["Please show me the names of everything you take.", "请给我看看您使用的所有药品名称。"],
      ["Should I mention supplements as well?", "也需要说明补充剂吗？"],
      ["Yes, please include those in the list.", "需要，请一并列出来。"],
      ["Who should I contact if I have more questions?", "如果还有疑问，我应该联系谁？"],
      ["You can contact the pharmacy or your prescriber.", "您可以联系药房或开处方的医护人员。"],
    ] },
  ],
  "office-building": [
    { title: "访客登记", roles: ["访客", "前台"], lines: [
      ["I'm here for a meeting with Jordan Lee.", "我来与Jordan Lee开会。"],
      ["Which company are you visiting?", "您要拜访哪家公司？"],
      ["North Studio on the fifth floor.", "五楼的North Studio。"],
      ["Please sign in and wear this visitor badge.", "请登记，并佩戴这张访客证。"],
      ["Do I need an access card for the lift?", "乘电梯需要门禁卡吗？"],
      ["Your host will meet you here and take you upstairs.", "接待您的人会来这里带您上楼。"],
    ] },
    { title: "会议室与设备", roles: ["同事甲", "同事乙"], lines: [
      ["Is this meeting room available until noon?", "这间会议室到中午之前有空吗？"],
      ["Yes, but please reserve it on the booking system.", "有，不过请先在预订系统中预约。"],
      ["Where can I connect my laptop to the screen?", "我在哪里可以把笔记本接到屏幕上？"],
      ["There is an HDMI cable in the centre of the table.", "桌子中央有一根HDMI线。"],
      ["Could you lower the blinds before we start?", "开始前你能把百叶窗放下来吗？"],
      ["Sure. I'll also check the microphone.", "可以，我也检查一下麦克风。"],
    ] },
  ],
};
