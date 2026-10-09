import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startOfWeek, endOfWeek, startOfMonth, subWeeks, format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

interface WeeklyMetrics {
  weekNumber: number;
  weekLabel: string;
  startDate: string;
  endDate: string;
  totalGasto: number;
  totalLeads: number;
  totalVendas: number;
  totalVendido: number;
  roiMedio: number;
  custoPorLeadMedio: number;
  taxaConversaoMedia: number;
  ticketMedio: number;
  daysWithData: number;
}

/**
 * GET /api/metrics/weekly
 * Retorna métricas consolidadas por semana
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const gestorId = searchParams.get('gestorId');
    const period = searchParams.get('period') || 'month'; // 'month' ou 'custom'
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Determinar período
    let startDate: Date;
    let endDate: Date = new Date();

    if (period === 'custom' && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      // Padrão: últimas 5 semanas (mês atual + extras)
      startDate = subWeeks(endDate, 5);
    }

    // Construir filtro de usuário
    let userFilter: any = {};

    if (session.user.role === 'atendente') {
      // Atendente vê apenas seus próprios dados
      userFilter = { userId: session.user.id };
    } else if (session.user.role === 'gestor' || session.user.role === 'gerente') {
      // Gestor/Gerente pode filtrar por userId ou gestorId
      if (userId) {
        userFilter = { userId };
      } else if (gestorId) {
        userFilter = { gestorId };
      }
      // Se nenhum filtro, pega todos os dados do gestor
      else if (session.user.role === 'gestor') {
        userFilter = {
          OR: [
            { userId: session.user.id },
            { gestorId: session.user.id },
          ],
        };
      }
      // Gerente sem filtro vê tudo (sem userFilter)
    }

    // Buscar métricas diárias no período
    const metrics = await prisma.dailyMetric.findMany({
      where: {
        ...userFilter,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    if (metrics.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          message: 'Nenhuma métrica encontrada no período',
        },
        { status: 200 }
      );
    }

    // Agrupar métricas por semana
    const weeklyData = new Map<string, WeeklyMetrics>();

    for (const metric of metrics) {
      const metricDate = new Date(metric.date);
      const weekStart = startOfWeek(metricDate, { locale: ptBR, weekStartsOn: 0 }); // Domingo
      const weekEnd = endOfWeek(metricDate, { locale: ptBR, weekStartsOn: 0 }); // Sábado
      const weekKey = format(weekStart, 'yyyy-MM-dd');

      if (!weeklyData.has(weekKey)) {
        // Calcular número da semana
        const weekNumber = Math.floor(differenceInDays(weekStart, startDate) / 7) + 1;

        weeklyData.set(weekKey, {
          weekNumber,
          weekLabel: `Semana ${weekNumber}`,
          startDate: format(weekStart, 'dd/MM/yyyy'),
          endDate: format(weekEnd, 'dd/MM/yyyy'),
          totalGasto: 0,
          totalLeads: 0,
          totalVendas: 0,
          totalVendido: 0,
          roiMedio: 0,
          custoPorLeadMedio: 0,
          taxaConversaoMedia: 0,
          ticketMedio: 0,
          daysWithData: 0,
        });
      }

      const week = weeklyData.get(weekKey)!;
      week.totalGasto += metric.valorGasto;
      week.totalLeads += metric.quantidadeLeads;
      week.totalVendas += metric.quantidadeVendas;
      week.totalVendido += metric.valorVendido;
      week.daysWithData++;
    }

    // Calcular métricas finais para cada semana
    const result: WeeklyMetrics[] = [];

    for (const week of weeklyData.values()) {
      // ROI Médio
      week.roiMedio =
        week.totalGasto > 0
          ? ((week.totalVendido - week.totalGasto) / week.totalGasto) * 100
          : 0;

      // Custo por Lead Médio
      week.custoPorLeadMedio =
        week.totalLeads > 0 ? week.totalGasto / week.totalLeads : 0;

      // Taxa de Conversão Média
      week.taxaConversaoMedia =
        week.totalLeads > 0 ? (week.totalVendas / week.totalLeads) * 100 : 0;

      // Ticket Médio
      week.ticketMedio =
        week.totalVendas > 0 ? week.totalVendido / week.totalVendas : 0;

      result.push(week);
    }

    // Ordenar por número da semana
    result.sort((a, b) => a.weekNumber - b.weekNumber);

    // Adicionar comparações entre semanas
    const comparisons: any[] = [];

    for (let i = 1; i < result.length; i++) {
      const current = result[i];
      const previous = result[i - 1];

      const comparison = {
        weekNumber: current.weekNumber,
        weekLabel: current.weekLabel,
        changes: {
          totalGasto: calculateChange(previous.totalGasto, current.totalGasto),
          totalLeads: calculateChange(previous.totalLeads, current.totalLeads),
          totalVendas: calculateChange(previous.totalVendas, current.totalVendas),
          totalVendido: calculateChange(previous.totalVendido, current.totalVendido),
          roiMedio: calculateChange(previous.roiMedio, current.roiMedio),
        },
      };

      comparisons.push(comparison);
    }

    // Identificar melhor e pior semana
    let bestWeek = result[0];
    let worstWeek = result[0];

    for (const week of result) {
      if (week.roiMedio > bestWeek.roiMedio) {
        bestWeek = week;
      }
      if (week.roiMedio < worstWeek.roiMedio) {
        worstWeek = week;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          weeks: result,
          comparisons,
          summary: {
            totalWeeks: result.length,
            bestWeek: {
              weekNumber: bestWeek.weekNumber,
              weekLabel: bestWeek.weekLabel,
              roi: bestWeek.roiMedio,
            },
            worstWeek: {
              weekNumber: worstWeek.weekNumber,
              weekLabel: worstWeek.weekLabel,
              roi: worstWeek.roiMedio,
            },
            overallMetrics: {
              totalGasto: result.reduce((sum, w) => sum + w.totalGasto, 0),
              totalLeads: result.reduce((sum, w) => sum + w.totalLeads, 0),
              totalVendas: result.reduce((sum, w) => sum + w.totalVendas, 0),
              totalVendido: result.reduce((sum, w) => sum + w.totalVendido, 0),
            },
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Erro ao buscar métricas semanais:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao buscar métricas semanais',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// Função auxiliar para calcular variação percentual
function calculateChange(previous: number, current: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
