/** Original bilingual practice, separate from grounded object-word counts. */
export interface SceneConversation {
  readonly title: string;
  readonly roles: readonly [string, string];
  readonly lines: readonly (readonly [string, string])[];
}

export const SCENE_CONVERSATIONS: Readonly<Record<string, readonly SceneConversation[]>> = {
  "security-checkpoint": [
    { title: "确认安检要求", roles: ["旅客", "安检员"], lines: [
      ["Which queue should I join for this checkpoint?", "这个安检口我应该排哪一队？"],
      ["Please join the queue beside the blue sign.", "请排在蓝色标牌旁的队伍里。"],
      ["Do I need to take my laptop out of its case here?", "在这里需要把笔记本电脑从包里拿出来吗？"],
      ["Please follow the instructions displayed at this lane.", "请按这条通道上显示的要求操作。"],
      ["I didn't catch the last instruction. Could you repeat it?", "最后一条要求我没听清，您能再说一次吗？"],
      ["Of course. Please wait here until I call you forward.", "当然，请在这里等我叫您向前走。"],
    ] },
    { title: "取回物品与寻求协助", roles: ["旅客", "安检员"], lines: [
      ["My tray is still on the conveyor. Should I wait here?", "我的托盘还在传送带上，我在这里等吗？"],
      ["Yes, please keep the exit clear while you wait.", "是的，等候时请不要挡住出口。"],
      ["I think I left my watch in another tray.", "我可能把手表落在另一个托盘里了。"],
      ["Can you describe the watch and the tray it was in?", "您能描述一下手表和放它的托盘吗？"],
      ["It has a silver face and a dark leather strap.", "它是银色表盘，配深色皮表带。"],
      ["Stay beside this counter while I check for you.", "请在这个柜台旁等候，我帮您查看。"],
    ] },
  ],
  "aircraft-cabin": [
    { title: "找座位与放行李", roles: ["乘客", "乘务员"], lines: [
      ["Could you help me find seat eighteen C?", "能帮我找一下十八排C座吗？"],
      ["It's the aisle seat on your left, two rows ahead.", "在前面两排，您左侧靠过道的位置。"],
      ["The overhead locker above my seat looks full.", "我座位上方的行李架看起来满了。"],
      ["Let me find a suitable space for your bag.", "我来给您的包找个合适的位置。"],
      ["Could you show me how to adjust this seat belt?", "您能示范一下如何调节这条安全带吗？"],
      ["Certainly. Keep the aisle clear while I help you.", "当然，我帮您时请不要挡住过道。"],
    ] },
    { title: "机上服务与沟通", roles: ["乘客", "乘务员"], lines: [
      ["May I have some still water when you have a moment?", "您方便的时候能给我一些不含气的水吗？"],
      ["Certainly. Would you like a cup as well?", "当然，您也需要一个杯子吗？"],
      ["Yes, and could you tell me what is in this meal?", "需要，还能告诉我这份餐食有哪些配料吗？"],
      ["I'll check the ingredient information for you.", "我会帮您查看配料信息。"],
      ["I missed the announcement about our connection.", "我没听清关于转机的广播。"],
      ["I'll repeat the information we have received.", "我来重复一下我们收到的信息。"],
    ] },
  ],
  "baggage-claim": [
    { title: "寻找行李转盘", roles: ["旅客", "工作人员"], lines: [
      ["Which carousel is handling bags from my flight?", "我的航班行李在哪个转盘领取？"],
      ["What flight number is printed on your boarding pass?", "您的登机牌上写着哪个航班号？"],
      ["It's AB twenty. I arrived from London.", "是AB二十次航班，我从伦敦来。"],
      ["Please check that flight on the baggage information screen.", "请在行李信息屏上查找这个航班。"],
      ["Where can I collect an oversized item?", "超大件行李在哪里领取？"],
      ["The oversized-baggage counter is beyond those carousels.", "超大件行李柜台在那些转盘后面。"],
    ] },
    { title: "报告行李未到", roles: ["旅客", "服务员"], lines: [
      ["The carousel has stopped, but my suitcase hasn't arrived.", "转盘停了，但我的行李箱还没到。"],
      ["Please show me your baggage tag and boarding pass.", "请出示您的行李标签和登机牌。"],
      ["It's a navy hard-shell case with a yellow ribbon.", "这是一个深蓝色硬壳箱，系着黄色丝带。"],
      ["Do you have a photograph of the case?", "您有这个箱子的照片吗？"],
      ["Yes. Could I have a reference number for this report?", "有，能给我这份报告的查询编号吗？"],
      ["Here it is. Keep it when you contact the baggage service.", "给您，联系行李服务部门时请留好它。"],
    ] },
  ],
  "library-reading-room": [
    { title: "找书与查目录", roles: ["读者", "馆员"], lines: [
      ["I'm looking for an introductory book about astronomy.", "我在找一本天文学入门书。"],
      ["Would you prefer an illustrated guide or a textbook?", "您更想要图解读物还是教材？"],
      ["An illustrated guide with a glossary would be helpful.", "带词汇表的图解读物会比较合适。"],
      ["Let's look up the title and shelf number in the catalogue.", "我们来目录中查找书名和书架编号。"],
      ["If it's on loan, can I reserve a copy?", "如果借出去了，我能预约一本吗？"],
      ["I can show you the reservation options for that title.", "我可以给您看这本书的预约选项。"],
    ] },
    { title: "借阅与安静学习", roles: ["读者", "馆员"], lines: [
      ["Where can I check the due date for these books?", "这些书的归还日期在哪里查看？"],
      ["You can find it on your loan receipt or library account.", "可以在借阅凭条或图书馆账户里查看。"],
      ["Is there a quiet desk with a power socket?", "有带电源插座的安静书桌吗？"],
      ["Try the desks along the wall in the reading room.", "可以去阅览室靠墙的书桌看看。"],
      ["May I leave my books here while I take a short break?", "我短暂休息时可以把书留在这里吗？"],
      ["Please check the desk-use notice and keep valuables with you.", "请查看书桌使用须知，并随身带好贵重物品。"],
    ] },
  ],
  "conference-room": [
    { title: "开始会议与共享屏幕", roles: ["主持人", "参会者"], lines: [
      ["Can everyone hear me clearly before we begin?", "开始前，大家都能听清我的声音吗？"],
      ["Your voice is clear, but we can't see your screen yet.", "声音很清楚，但我们还看不到您共享的屏幕。"],
      ["I'll share the agenda first, then open the proposal.", "我先共享议程，然后打开提案。"],
      ["Could you enlarge the figures on the second slide?", "能放大第二张幻灯片上的数字吗？"],
      ["Is this size readable from the back of the room?", "这个字号在会议室后排能看清吗？"],
      ["Yes. Please keep that view while we discuss the costs.", "可以，请保持这个画面，我们来讨论费用。"],
    ] },
    { title: "确认决定与分工", roles: ["主持人", "参会者"], lines: [
      ["What concerns do we need to resolve before agreeing?", "达成一致之前，我们需要解决哪些顾虑？"],
      ["We need to confirm the delivery date and available staff.", "我们需要确认交付日期和可用人员。"],
      ["Who will follow up with the supplier?", "谁来跟进供应商？"],
      ["I'll contact them and send an update tomorrow morning.", "我来联系他们，明早发送进展。"],
      ["Could you include the agreed actions in the minutes?", "能把商定的行动事项记入会议纪要吗？"],
      ["Yes, with an owner and a deadline for each action.", "可以，每项都会注明负责人和截止时间。"],
    ] },
  ],
  "school-catering-kitchen": [
    { title: "交接备餐任务", roles: ["同事甲", "同事乙"], lines: [
      ["Which preparation tasks are still outstanding?", "还有哪些备餐任务没完成？"],
      ["The vegetables are ready, but the serving trays need arranging.", "蔬菜准备好了，但还需要摆好供餐托盘。"],
      ["Where should I place the clean utensils?", "干净的用具应该放在哪里？"],
      ["Put them on the designated clean rack by the service pass.", "放在出餐口旁指定的清洁用具架上。"],
      ["Has the menu change been passed on to the serving team?", "菜单变动已经通知供餐团队了吗？"],
      ["Not yet. Please ask the supervisor to confirm it with them.", "还没有，请主管和他们确认一下。"],
    ] },
    { title: "确认标签与报告问题", roles: ["同事甲", "主管"], lines: [
      ["The label on this container is difficult to read.", "这个容器上的标签不太清楚。"],
      ["Set it aside while we check the preparation record.", "先把它放在一旁，我们查一下制备记录。"],
      ["A student has asked about allergens in today's dish.", "有学生问今天这道菜含有哪些过敏原。"],
      ["Please use the approved ingredient information, not a guess.", "请查看已确认的配料信息，不要猜测。"],
      ["There is also a loose handle on the trolley.", "另外，推车上有一个把手松了。"],
      ["Leave that trolley out of use and report it for repair.", "先停用那辆推车，并报修。"],
    ] },
  ],
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
