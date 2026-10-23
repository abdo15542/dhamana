import 'package:flutter/material.dart';

void main() {
  runApp(const DhamanaApp());
}

class DhamanaApp extends StatelessWidget {
  const DhamanaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Dhamana',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.amber),
        scaffoldBackgroundColor: const Color(0xFF06111D),
        fontFamily: 'Cairo',
      ),
      home: const DhamanaHomePage(),
    );
  }
}

class DhamanaHomePage extends StatelessWidget {
  const DhamanaHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final offers = [
      {'title': 'بيع USDT', 'price': '3.72 USD', 'status': 'مفتوح'},
      {'title': 'شراء BNB', 'price': '2.86 USD', 'status': 'آمن'},
      {'title': 'تبادل BTC', 'price': '12.10 USD', 'status': 'مميز'},
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1728),
        title: const Text('ضمانة', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_none, color: Colors.amber),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'اشترِ وبِع بثقة…\nالوسيط يحمي أموالك.',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: const Color(0xFF0F1C2D),
                  border: Border.all(color: Colors.white12),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('حالة الصفقة', style: TextStyle(color: Colors.white70)),
                    Text('آمنة', style: TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.swap_horiz),
                      label: const Text('السوق'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.amber,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.shield_rounded),
                      label: const Text('الضمان'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Text('أحدث العروض', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 12),
              ...offers.map((offer) => Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0C1A2B),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(offer['title']!, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 4),
                            Text(offer['status']!, style: const TextStyle(color: Colors.greenAccent)),
                          ],
                        ),
                        Text(offer['price']!, style: const TextStyle(color: Colors.amber, fontSize: 18, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
